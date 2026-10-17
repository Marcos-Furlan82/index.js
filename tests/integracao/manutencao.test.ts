import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { limparMidiasPendentes, limparMidiasRejeitadas } from "@/armazenamento/limpeza";
import { limparClienteR2 } from "@/armazenamento/r2";
import { expirarReservas } from "@/custos/reservas";
import { garantirJobsDiarios } from "@/jobs/agendamentos";
import { despachar } from "@/jobs/despachante";
import { executarLote } from "@/jobs/executor";
import { limparCacheEnv } from "@/lib/env";
import { obterDb } from "@/lib/db";

const s3 = mockClient(S3Client);
const db = () => obterDb();
const HORA = 60 * 60 * 1000;

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
  s3.on(DeleteObjectCommand).resolves({});
});

afterAll(() => s3.restore());

async function midia(status: "PENDENTE" | "DISPONIVEL" | "REJEITADA", idadeMs: number, privada = false, chave?: string) {
  return db().midia.create({
    data: {
      origem: "UPLOAD",
      status,
      chave: chave ?? `x/${Math.random()}.png`,
      tipoMime: "image/png",
      tamanhoBytes: 10n,
      nomeOriginal: "a.png",
      privada,
      miniaturaChave: privada ? `${chave ?? "x"}.mini.webp` : null,
      criadoEm: new Date(Date.now() - idadeMs),
    },
  });
}

describe("manutenção diária", () => {
  it("apaga uploads pendentes antigos no bucket certo e mantém os recentes", async () => {
    await midia("PENDENTE", 25 * HORA, false, "publica/velha.png");
    await midia("PENDENTE", 25 * HORA, true, "privada/velha.svg");
    const recente = await midia("PENDENTE", 2 * HORA);
    const disponivel = await midia("DISPONIVEL", 48 * HORA);
    expect(await limparMidiasPendentes()).toBe(2);
    const chamadas = s3.commandCalls(DeleteObjectCommand).map((c) => `${c.args[0].input.Bucket}:${c.args[0].input.Key}`);
    expect(chamadas.sort()).toEqual(["midias:publica/velha.png", "privado:privada/velha.svg", "privado:privada/velha.svg.mini.webp"]);
    const restantes = (await db().midia.findMany()).map((m) => m.id).sort();
    expect(restantes).toEqual([recente.id, disponivel.id].sort());
    // Idempotente.
    expect(await limparMidiasPendentes()).toBe(0);
  });

  it("apaga em lotes de 100", async () => {
    for (let i = 0; i < 130; i++) await midia("PENDENTE", 30 * HORA);
    expect(await limparMidiasPendentes()).toBe(130);
    expect(await db().midia.count()).toBe(0);
  });

  it("rejeitadas com mais de 7 dias saem só do banco", async () => {
    await midia("REJEITADA", 8 * 24 * HORA);
    await midia("REJEITADA", 1 * 24 * HORA);
    expect(await limparMidiasRejeitadas()).toBe(1);
    expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(0);
  });

  it("expira só reservas ATIVA vencidas", async () => {
    const base = { mesReferencia: "2026-10", valorBrl: "1", origem: "job:x" };
    await db().reservaOrcamento.create({ data: { ...base, expiraEm: new Date(Date.now() - 1000) } });
    await db().reservaOrcamento.create({ data: { ...base, expiraEm: new Date(Date.now() + HORA) } });
    await db().reservaOrcamento.create({ data: { ...base, status: "CONCILIADA", expiraEm: new Date(Date.now() - 1000) } });
    expect(await expirarReservas()).toBe(1);
    expect(await db().reservaOrcamento.count({ where: { status: "EXPIRADA" } })).toBe(1);
  });

  it("um job por dia (fuso de SP), criado pelo despacho, que roda ponta a ponta", async () => {
    const a = await garantirJobsDiarios(db(), new Date("2026-10-16T02:00:00Z")); // 15/10 em SP
    const b = await garantirJobsDiarios(db(), new Date("2026-10-16T02:59:00Z"));
    const c = await garantirJobsDiarios(db(), new Date("2026-10-16T03:30:00Z")); // 16/10 em SP
    expect(a.id).toBe(b.id);
    expect(a.chaveIdempotencia).toBe("manutencao:2026-10-15");
    expect(c.chaveIdempotencia).toBe("manutencao:2026-10-16");
    await db().job.deleteMany();

    await despachar({ baseUrl: "https://s", segredo: "x".repeat(40), paralelismo: 0, fetch: async () => new Response(null, { status: 202 }) });
    expect(await db().job.count({ where: { tipo: "manutencao-diaria" } })).toBe(1);
    const resumo = await executarLote();
    expect(resumo.concluidos).toBe(1);
  });
});
