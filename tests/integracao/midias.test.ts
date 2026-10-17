import { DeleteObjectCommand, HeadObjectCommand, NotFound, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { confirmarUpload, solicitarUpload } from "@/armazenamento/midias";
import { limparClienteR2 } from "@/armazenamento/r2";
import { limparCacheEnv } from "@/lib/env";
import { obterDb } from "@/lib/db";

const s3 = mockClient(S3Client);

beforeEach(() => {
  Object.assign(process.env, {
    R2_ACCOUNT_ID: "conta123",
    R2_ACCESS_KEY_ID: "AKIDTESTE",
    R2_SECRET_ACCESS_KEY: "segredo-teste",
    R2_BUCKET: "midias",
    R2_PUBLIC_BASE_URL: "https://midia.exemplo.com",
  });
  limparCacheEnv();
  limparClienteR2();
  s3.reset();
});

afterAll(() => s3.restore());

async function solicitar(tamanhoBytes = 1000, tipoMime = "image/png") {
  const r = await solicitarUpload({ tipoMime, tamanhoBytes, nomeOriginal: "arte.png" });
  if (!r.ok) throw new Error(r.erro);
  return r;
}

describe("upload direto ao R2", () => {
  it("solicitar cria Mídia PENDENTE e devolve URL pré-assinada", async () => {
    const r = await solicitar();
    const midia = await obterDb().midia.findUniqueOrThrow({ where: { id: r.midiaId } });
    expect(midia).toMatchObject({ status: "PENDENTE", origem: "UPLOAD", tipoMime: "image/png", tamanhoBytes: 1000n });
    expect(r.url).toContain(midia.chave);
    expect(r.url).toContain("X-Amz-Signature=");
  });

  it("solicitar recusa tipo proibido sem criar nada", async () => {
    const r = await solicitarUpload({ tipoMime: "text/html", tamanhoBytes: 10, nomeOriginal: "x.html" });
    expect(r).toEqual({ ok: false, erro: "Tipo de arquivo não permitido." });
    expect(await obterDb().midia.count()).toBe(0);
  });

  it("confirmar com tamanho e tipo corretos deixa DISPONIVEL com URL pública", async () => {
    const r = await solicitar();
    s3.on(HeadObjectCommand).resolves({ ContentLength: 1000, ContentType: "image/png" });
    const c = await confirmarUpload(r.midiaId);
    expect(c.ok).toBe(true);
    const midia = await obterDb().midia.findUniqueOrThrow({ where: { id: r.midiaId } });
    expect(midia.status).toBe("DISPONIVEL");
    expect(midia.urlPublica).toBe(`https://midia.exemplo.com/${midia.chave}`);
    expect(midia.confirmadoEm).not.toBeNull();
    // Segunda confirmação não faz nada.
    expect((await confirmarUpload(r.midiaId)).ok).toBe(false);
    expect(s3.commandCalls(HeadObjectCommand)).toHaveLength(1);
  });

  it("tamanho diferente: apaga o objeto e rejeita", async () => {
    const r = await solicitar();
    s3.on(HeadObjectCommand).resolves({ ContentLength: 999_999, ContentType: "image/png" });
    s3.on(DeleteObjectCommand).resolves({});
    const c = await confirmarUpload(r.midiaId);
    expect(c.ok).toBe(false);
    expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(1);
    expect((await obterDb().midia.findUniqueOrThrow({ where: { id: r.midiaId } })).status).toBe("REJEITADA");
  });

  it("objeto inexistente: rejeita sem apagar", async () => {
    const r = await solicitar();
    s3.on(HeadObjectCommand).rejects(new NotFound({ message: "não existe", $metadata: { httpStatusCode: 404 } }));
    const c = await confirmarUpload(r.midiaId);
    expect(c).toEqual({ ok: false, erro: "Arquivo não encontrado no armazenamento." });
    expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(0);
    expect((await obterDb().midia.findUniqueOrThrow({ where: { id: r.midiaId } })).status).toBe("REJEITADA");
  });
});
