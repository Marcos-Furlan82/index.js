import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { destinoDoRedirect, requisicaoFalsa } from "./next-falso";
import {
  concluirReferenciasAcao,
  confirmarUploadReferenciaAcao,
  solicitarUploadReferenciaAcao,
} from "@/app/(painel)/contas/[contaId]/briefing/referencias/actions";
import {
  concluirReferencias,
  confirmarUploadReferencia,
  salvarMetadadosReferencia,
  solicitarUploadReferencia,
  urlLeituraPrivada,
} from "@/armazenamento/referencias";
import { limparClienteR2 } from "@/armazenamento/r2";
import { criarConta } from "@/contas/contas";
import { limparCacheEnv } from "@/lib/env";
import { obterDb } from "@/lib/db";
import { entrarComoGestor } from "./ajudantes";

const s3 = mockClient(S3Client);
const db = () => obterDb();

beforeEach(() => {
  Object.assign(process.env, {
    R2_ACCOUNT_ID: "conta123",
    R2_ACCESS_KEY_ID: "AKIDTESTE",
    R2_SECRET_ACCESS_KEY: "segredo-teste",
    R2_BUCKET: "midias",
    R2_BUCKET_PRIVADO: "privado",
    R2_PUBLIC_BASE_URL: "https://midia.exemplo.com",
  });
  limparCacheEnv();
  limparClienteR2();
  s3.reset();
  s3.on(PutObjectCommand).resolves({});
  s3.on(DeleteObjectCommand).resolves({});
  requisicaoFalsa.limpar();
});

afterAll(() => s3.restore());

async function novaConta(usuario = "doceatelie") {
  const r = await criarConta({ nome: "Doce Ateliê", usuarioInstagram: usuario });
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

function imagem(largura: number, altura: number, opcoes: { alfa?: boolean; formato?: "png" | "jpeg" | "webp"; cor?: string } = {}) {
  const alfa = opcoes.alfa ?? false;
  const base = sharp({
    create: { width: largura, height: altura, channels: alfa ? 4 : 3, background: alfa ? { r: 194, g: 24, b: 91, alpha: 0.4 } : (opcoes.cor ?? "#c2185b") },
  });
  return (opcoes.formato === "jpeg" ? base.jpeg() : opcoes.formato === "webp" ? base.webp() : base.png()).toBuffer();
}

/** Simula o objeto no bucket privado para HEAD e GET. */
function simularObjeto(chave: string, corpo: Buffer, tipo: string) {
  s3.on(HeadObjectCommand, { Key: chave }).resolves({ ContentLength: corpo.length, ContentType: tipo });
  s3.on(GetObjectCommand, { Key: chave }).resolves({
    ContentLength: corpo.length,
    Body: { transformToByteArray: async () => new Uint8Array(corpo) } as never,
  });
}

async function enviar(contaId: string, categoria: string, corpo: Buffer, tipoMime: string, nome = "arquivo", extra: Record<string, unknown> = {}) {
  const pedido = await solicitarUploadReferencia({ contaId, categoria, tipoMime, tamanhoBytes: corpo.length, nomeOriginal: nome, ...extra });
  if (!pedido.ok) return { pedido, confirmacao: null };
  const midia = await db().midia.findUniqueOrThrow({ where: { id: pedido.midiaId } });
  simularObjeto(midia.chave, corpo, pedido.tipoMime);
  return { pedido, confirmacao: await confirmarUploadReferencia(contaId, pedido.midiaId), midia };
}

describe("referências visuais (bucket privado)", () => {
  it("solicitar: tipo por categoria, 15 MB, licença da fonte e tipo da fonte pela extensão", async () => {
    const conta = await novaConta();
    const base = { contaId: conta.id, tamanhoBytes: 1000, nomeOriginal: "x" };
    expect(await solicitarUploadReferencia({ ...base, categoria: "ARTE", tipoMime: "image/svg+xml" })).toEqual({ ok: false, erro: "Tipo de arquivo não aceito aqui." });
    expect(await solicitarUploadReferencia({ ...base, categoria: "ARTE", tipoMime: "text/html" })).toMatchObject({ ok: false });
    expect(await solicitarUploadReferencia({ ...base, categoria: "ARTE", tipoMime: "image/png", tamanhoBytes: 15 * 1024 * 1024 + 1 })).toMatchObject({
      ok: false,
      erro: "Arquivo grande demais (máximo 15 MB).",
    });
    expect((await solicitarUploadReferencia({ ...base, categoria: "FONTE", tipoMime: "", nomeOriginal: "marca.otf" })).ok).toBe(false);
    const fonte = await solicitarUploadReferencia({ ...base, categoria: "FONTE", tipoMime: "", nomeOriginal: "marca.otf", licencaFonte: true });
    expect(fonte).toMatchObject({ ok: true, tipoMime: "font/otf" });
    if (!fonte.ok) return;
    const url = new URL(fonte.url);
    expect(url.pathname).toMatch(new RegExp(`^/privado/contas/${conta.id}/referencias/[0-9a-f-]+\\.otf$`));
    const midia = await db().midia.findUniqueOrThrow({ where: { id: fonte.midiaId } });
    expect(midia).toMatchObject({ privada: true, status: "PENDENTE", urlPublica: null });
  });

  it("limite de 10 artes conta as disponíveis e as pendentes da última hora", async () => {
    const conta = await novaConta();
    for (let i = 0; i < 10; i++) {
      expect((await solicitarUploadReferencia({ contaId: conta.id, categoria: "ARTE", tipoMime: "image/png", tamanhoBytes: 10, nomeOriginal: `a${i}.png` })).ok).toBe(true);
    }
    const r = await solicitarUploadReferencia({ contaId: conta.id, categoria: "ARTE", tipoMime: "image/png", tamanhoBytes: 10, nomeOriginal: "a.png" });
    expect(r).toEqual({ ok: false, erro: "Você já enviou 10 artes. Remova uma para enviar outra." });
    await db().midia.updateMany({ data: { criadoEm: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    expect((await solicitarUploadReferencia({ contaId: conta.id, categoria: "ARTE", tipoMime: "image/png", tamanhoBytes: 10, nomeOriginal: "a.png" })).ok).toBe(true);
  });

  it("arte válida: guarda o original, gera miniatura e fica DISPONIVEL; URL de leitura assinada por 5 min", async () => {
    const conta = await novaConta();
    const { confirmacao, midia } = await enviar(conta.id, "ARTE", await imagem(1080, 1350, { formato: "jpeg" }), "image/jpeg", "post.jpg");
    expect(confirmacao).toEqual({ ok: true, avisos: [] });
    const final = await db().midia.findUniqueOrThrow({ where: { id: midia!.id } });
    expect(final).toMatchObject({ status: "DISPONIVEL", largura: 1080, altura: 1350, urlPublica: null, miniaturaChave: `${midia!.chave}.mini.webp` });
    expect(final.sha256).toMatch(/^[0-9a-f]{64}$/);
    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ Bucket: "privado", Key: `${midia!.chave}.mini.webp`, ContentType: "image/webp" });
    const url = new URL(await urlLeituraPrivada(final.miniaturaChave!));
    expect(url.pathname).toBe(`/privado/${final.miniaturaChave}`);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
  });

  it("magic bytes diferentes do declarado: apaga e rejeita", async () => {
    const conta = await novaConta();
    const { confirmacao, midia } = await enviar(conta.id, "ARTE", await imagem(1200, 1200, { formato: "jpeg" }), "image/png", "arte.png");
    expect(confirmacao).toMatchObject({ ok: false });
    expect((await db().midia.findUniqueOrThrow({ where: { id: midia!.id } })).status).toBe("REJEITADA");
    expect(s3.commandCalls(DeleteObjectCommand).map((c) => c.args[0].input)).toEqual([{ Bucket: "privado", Key: midia!.chave }]);
  });

  it("arte com menos de 1080 px e arquivo duplicado são recusados", async () => {
    const conta = await novaConta();
    expect((await enviar(conta.id, "ARTE", await imagem(800, 1000), "image/png")).confirmacao).toMatchObject({
      ok: false,
      erro: "A arte precisa ter pelo menos 1080 px de largura (esta tem 800 px).",
    });
    const arte = await imagem(1200, 1200);
    expect((await enviar(conta.id, "ARTE", arte, "image/png")).confirmacao?.ok).toBe(true);
    expect((await enviar(conta.id, "ARTE", arte, "image/png")).confirmacao).toEqual({ ok: false, erro: "Este arquivo já foi enviado para esta conta." });
    // Em outra conta pode.
    const outra = await novaConta("outra");
    expect((await enviar(outra.id, "ARTE", arte, "image/png")).confirmacao?.ok).toBe(true);
  });

  it("logo: menor que 1000 px recusa; sem transparência e JPG geram aviso; PDF vira arquivo original", async () => {
    const conta = await novaConta();
    expect((await enviar(conta.id, "LOGO", await imagem(600, 300, { alfa: true }), "image/png")).confirmacao?.ok).toBe(false);
    expect((await enviar(conta.id, "LOGO", await imagem(1200, 400, { cor: "#111111" }), "image/png")).confirmacao).toEqual({
      ok: true,
      avisos: ["Este logo não tem fundo transparente. Se tiver uma versão transparente, prefira."],
    });
    const jpg = await enviar(conta.id, "LOGO_NEGATIVO", await imagem(1200, 400, { formato: "jpeg" }), "image/jpeg");
    expect(jpg.confirmacao).toMatchObject({ ok: true, avisos: [expect.stringContaining("JPG")] });
    const pdf = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    const { confirmacao, pedido } = await enviar(conta.id, "LOGO", pdf, "application/pdf", "logo.pdf");
    expect(confirmacao).toEqual({ ok: true, avisos: [] });
    const ref = await db().referencia.findUniqueOrThrow({ where: { id: pedido.ok ? pedido.referenciaId : "" } });
    expect(ref.categoria).toBe("LOGO_ARQUIVO_FONTE");
  });

  it("SVG malicioso é limpo e regravado; o original sanitizado gera a miniatura", async () => {
    const conta = await novaConta();
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" onload="alert(1)"><script>alert(1)</script><rect width="1200" height="600" fill="#c2185b"/></svg>',
    );
    const { confirmacao, midia } = await enviar(conta.id, "LOGO", svg, "image/svg+xml", "logo.svg");
    expect(confirmacao).toMatchObject({ ok: true, avisos: [expect.stringContaining("Removemos partes do SVG")] });
    const puts = s3.commandCalls(PutObjectCommand).map((c) => c.args[0].input);
    const regravado = puts.find((p) => p.Key === midia!.chave);
    expect(regravado?.ContentType).toBe("image/svg+xml");
    const texto = Buffer.from(regravado!.Body as Buffer).toString("utf8");
    expect(texto).not.toContain("script");
    expect(texto).not.toContain("onload");
    expect(puts.some((p) => p.Key === `${midia!.chave}.mini.webp`)).toBe(true);
    const final = await db().midia.findUniqueOrThrow({ where: { id: midia!.id } });
    expect(final.tamanhoBytes).toBe(BigInt(texto.length));
    expect(final.temAlfa).toBe(true);
    // Link do original força download.
    const url = new URL(await urlLeituraPrivada(final.chave, { nomeDownload: "logo.svg", tipoMime: "image/svg+xml" }));
    expect(url.searchParams.get("response-content-disposition")).toContain("attachment");
  });

  it("metadados e conclusão da etapa (logo + 3 artes com origem) criam a versão do conjunto", async () => {
    const conta = await novaConta();
    expect(await concluirReferencias(conta.id)).toMatchObject({ ok: false });
    await enviar(conta.id, "LOGO", await imagem(1200, 400, { alfa: true }), "image/png");
    const artes = [];
    for (const [l, a] of [
      [1080, 1080],
      [1080, 1350],
      [1080, 1920],
    ]) {
      const r = await enviar(conta.id, "ARTE", await imagem(l, a, { cor: `#${l}${a}`.slice(0, 7) }), "image/png");
      artes.push(r.pedido.ok ? r.pedido.referenciaId : "");
    }
    const parcial = await concluirReferencias(conta.id);
    expect(parcial).toMatchObject({ ok: false, erro: expect.stringContaining("3 artes") });

    expect(await salvarMetadadosReferencia(conta.id, artes[0], { origem: "PROPRIA" })).toMatchObject({ ok: false });
    expect(await salvarMetadadosReferencia(conta.id, artes[0], { origem: "PROPRIA", direitoDeclarado: true, gosta: ["CORES"], formato: "POST" })).toEqual({ ok: true });
    for (const id of artes.slice(1)) {
      expect(await salvarMetadadosReferencia(conta.id, id, { origem: "TERCEIROS", direitoDeclarado: true })).toEqual({ ok: true });
    }
    const terceiros = await db().referencia.findUniqueOrThrow({ where: { id: artes[1] } });
    expect(terceiros.direitoDeclarado).toBe(false);

    const r = await concluirReferencias(conta.id);
    expect(r).toMatchObject({ ok: true, versao: 1 });
    const conjunto = await db().conjuntoReferencias.findFirstOrThrow({ where: { contaId: conta.id } });
    expect((conjunto.itens as unknown[]).length).toBe(4);
    expect((await db().marca.findUniqueOrThrow({ where: { contaId: conta.id } })).referenciasConcluidasEm).not.toBeNull();
    expect((await concluirReferencias(conta.id)).ok && 2).toBe(2);
  });

  it("ações exigem sessão e conta editável", async () => {
    const conta = await novaConta();
    const dados = { contaId: conta.id, categoria: "ARTE", tipoMime: "image/png", tamanhoBytes: 10, nomeOriginal: "a.png" };
    expect(await destinoDoRedirect(() => solicitarUploadReferenciaAcao(dados))).toBe("/login");
    await entrarComoGestor();
    expect((await solicitarUploadReferenciaAcao(dados)).ok).toBe(true);
    const outra = await novaConta("outra");
    const midia = await db().midia.findFirstOrThrow();
    // Mídia de uma conta confirmada pela outra: recusa.
    expect(await confirmarUploadReferenciaAcao(outra.id, midia.id)).toEqual({ ok: false, erro: "Envio não encontrado ou já confirmado." });
    await db().contaInstagram.update({ where: { id: conta.id }, data: { arquivadaEm: new Date() } });
    expect((await solicitarUploadReferenciaAcao(dados)).ok).toBe(false);
    const f = new FormData();
    f.set("contaId", conta.id);
    expect((await concluirReferenciasAcao({}, f)).erro).toBeTruthy();
  });
});
