import { beforeEach, describe, expect, it } from "vitest";
import { destinoDoRedirect, requisicaoFalsa } from "./next-falso";
import { enfileirarPing, tentarDeNovo } from "@/app/(painel)/configuracoes/sistema/actions";
import { obterDb } from "@/lib/db";
import { entrarComoGestor } from "./ajudantes";

function form(dados: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(dados)) f.set(k, v);
  return f;
}

beforeEach(() => requisicaoFalsa.limpar());

describe("ações da tela Sistema", () => {
  it("sem sessão redirecionam para o login e não fazem nada", async () => {
    expect(await destinoDoRedirect(() => enfileirarPing())).toBe("/login");
    const job = await obterDb().job.create({ data: { tipo: "ping", payload: {}, status: "FALHOU" } });
    expect(await destinoDoRedirect(() => tentarDeNovo({}, form({ jobId: job.id })))).toBe("/login");
    expect(await obterDb().job.count({ where: { status: "PENDENTE" } })).toBe(0);
  });

  it("enfileirar ping com sessão cria o job", async () => {
    await entrarComoGestor();
    expect((await enfileirarPing()).ok).toBeTruthy();
    expect(await obterDb().job.findFirst()).toMatchObject({ tipo: "ping", status: "PENDENTE" });
  });

  it("tentar de novo valida o id e só reabre FALHOU/CANCELADO", async () => {
    await entrarComoGestor();
    expect(await tentarDeNovo({}, form({ jobId: "nao-e-uuid" }))).toEqual({ erro: "Job inválido." });
    const concluido = await obterDb().job.create({ data: { tipo: "ping", payload: {}, status: "CONCLUIDO" } });
    expect((await tentarDeNovo({}, form({ jobId: concluido.id }))).erro).toBeTruthy();
    const falhou = await obterDb().job.create({ data: { tipo: "ping", payload: {}, status: "FALHOU", tentativas: 3 } });
    expect((await tentarDeNovo({}, form({ jobId: falhou.id }))).ok).toBeTruthy();
    expect(await obterDb().job.findUniqueOrThrow({ where: { id: falhou.id } })).toMatchObject({
      status: "PENDENTE",
      tentativas: 0,
    });
  });
});

describe("ações de upload da tela Sistema", () => {
  it("sem sessão redirecionam para o login", async () => {
    const { solicitarUploadTeste, confirmarUploadTeste } = await import(
      "@/app/(painel)/configuracoes/sistema/actions"
    );
    expect(
      await destinoDoRedirect(() =>
        solicitarUploadTeste({ tipoMime: "image/png", tamanhoBytes: 10, nomeOriginal: "a.png" }),
      ),
    ).toBe("/login");
    expect(await destinoDoRedirect(() => confirmarUploadTeste("6f1c2a8e-1111-4222-8333-444455556666"))).toBe(
      "/login",
    );
    expect(await obterDb().midia.count()).toBe(0);
  });

  it("com sessão, só aceita imagens", async () => {
    const { solicitarUploadTeste } = await import("@/app/(painel)/configuracoes/sistema/actions");
    await entrarComoGestor();
    const r = await solicitarUploadTeste({ tipoMime: "video/mp4", tamanhoBytes: 10, nomeOriginal: "a.mp4" });
    expect(r.ok).toBe(false);
    expect(await obterDb().midia.count()).toBe(0);
  });
});
