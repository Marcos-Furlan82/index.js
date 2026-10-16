import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ErroComEspera, ErroPermanente } from "@/jobs/erros";
import { executarLote } from "@/jobs/executor";
import {
  concluir,
  contarAtivos,
  contarVencidos,
  enfileirarJob,
  reenfileirarJob,
  registrarFalha,
  reivindicarProximo,
  recuperarTravados,
} from "@/jobs/fila";
import { MARGEM_CLAIM_MS, PRAZO_RECUPERACAO_MS } from "@/jobs/limites";
import { maiorTimeout, REGISTRO } from "@/jobs/registro";
import { definirJob, type Registro } from "@/jobs/tipos";
import { criarDb, obterDb } from "@/lib/db";

const db = () => obterDb();

function registroDeTeste(executar: (payload: { n: number }, signal: AbortSignal) => Promise<unknown>, extra: { timeoutMs?: number; maxTentativas?: number } = {}): Registro {
  return {
    ...REGISTRO,
    teste: definirJob({
      schema: z.object({ n: z.number() }),
      executar: ({ payload, signal }) => executar(payload, signal),
      ...extra,
    }),
  };
}

async function vencerAgora(id: string) {
  await db().job.update({ where: { id }, data: { executarEm: new Date(Date.now() - 1000) } });
}

const clientesExtras: ReturnType<typeof criarDb>[] = [];
afterEach(async () => {
  await Promise.all(clientesExtras.splice(0).map((c) => c.$disconnect()));
});

describe("enfileirar", () => {
  it("valida o payload pelo schema do tipo", async () => {
    await expect(enfileirarJob({ tipo: "ping", payload: { origem: 123 } })).rejects.toThrow(/Payload inválido/);
    await expect(enfileirarJob({ tipo: "inexistente", payload: {} })).rejects.toThrow(/desconhecido/);
  });

  it("chave de idempotência devolve o existente, mesmo se FALHOU", async () => {
    const a = await enfileirarJob({ tipo: "ping", payload: {}, chaveIdempotencia: "k1" });
    await db().job.update({ where: { id: a.id }, data: { status: "FALHOU" } });
    const b = await enfileirarJob({ tipo: "ping", payload: { origem: "outro" }, chaveIdempotencia: "k1" });
    expect(b.id).toBe(a.id);
    expect(b.status).toBe("FALHOU");
    expect(await db().job.count()).toBe(1);
  });

  it("10 enfileiramentos concorrentes com a mesma chave criam 1 linha", async () => {
    const jobs = await Promise.all(
      Array.from({ length: 10 }, () => enfileirarJob({ tipo: "ping", payload: {}, chaveIdempotencia: "mesma" })),
    );
    expect(new Set(jobs.map((j) => j.id)).size).toBe(1);
    expect(await db().job.count()).toBe(1);
  });

  it("enfileira dentro de uma transação", async () => {
    await db().$transaction(async (tx) => {
      await enfileirarJob({ tipo: "ping", payload: {}, chaveIdempotencia: "tx" }, tx);
    });
    expect(await db().job.count()).toBe(1);
  });
});

describe("executor", () => {
  it("ping ponta a ponta", async () => {
    const job = await enfileirarJob({ tipo: "ping", payload: { origem: "teste" } });
    const resumo = await executarLote();
    expect(resumo).toMatchObject({ executados: 1, concluidos: 1, falhas: 0, motivoFim: "fila_vazia" });
    const final = await db().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(final.status).toBe("CONCLUIDO");
    expect(final.tentativas).toBe(1);
    expect(final.lockedAt).toBeNull();
    expect(final.resultado).toMatchObject({ pong: true });
  });

  it("30 jobs, 3 executores com conexões próprias: cada job roda uma única vez", async () => {
    const execucoes = new Map<number, number>();
    const registro = registroDeTeste(async ({ n }) => {
      execucoes.set(n, (execucoes.get(n) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 5));
      return { n };
    });
    for (let n = 0; n < 30; n++) await enfileirarJob({ tipo: "teste", payload: { n } }, db(), registro);
    const clientes = [criarDb({ poolMax: 2 }), criarDb({ poolMax: 2 }), criarDb({ poolMax: 2 })];
    clientesExtras.push(...clientes);
    const resumos = await Promise.all(clientes.map((c) => executarLote({ db: c, registro })));
    expect(resumos.reduce((s, r) => s + r.concluidos, 0)).toBe(30);
    expect(execucoes.size).toBe(30);
    expect([...execucoes.values()].every((v) => v === 1)).toBe(true);
    expect(await db().job.count({ where: { status: "CONCLUIDO" } })).toBe(30);
  });

  it("falha temporária volta para PENDENTE com backoff até esgotar as tentativas", async () => {
    const registro = registroDeTeste(async () => {
      throw new Error("instável");
    }, { maxTentativas: 3 });
    const job = await enfileirarJob({ tipo: "teste", payload: { n: 1 } }, db(), registro);

    const antes = Date.now();
    await executarLote({ registro });
    let atual = await db().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(atual).toMatchObject({ status: "PENDENTE", tentativas: 1, lockedAt: null });
    expect(atual.erro).toContain("instável");
    const atraso = atual.executarEm.getTime() - antes;
    expect(atraso).toBeGreaterThanOrEqual(24_000 - 2000);
    expect(atraso).toBeLessThanOrEqual(36_000 + 2000);

    // Ainda não venceu: nada a executar.
    expect((await executarLote({ registro })).executados).toBe(0);

    for (let i = 0; i < 2; i++) {
      await vencerAgora(job.id);
      await executarLote({ registro });
    }
    atual = await db().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(atual).toMatchObject({ status: "FALHOU", tentativas: 3 });
    expect(atual.concluidoEm).not.toBeNull();
  });

  it("ErroPermanente vai direto para FALHOU", async () => {
    const registro = registroDeTeste(async () => {
      throw new ErroPermanente("não adianta repetir");
    });
    const job = await enfileirarJob({ tipo: "teste", payload: { n: 1 } }, db(), registro);
    await executarLote({ registro });
    expect(await db().job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "FALHOU",
      tentativas: 1,
    });
  });

  it("tipo desconhecido e payload inválido no banco viram FALHOU", async () => {
    const a = await db().job.create({ data: { tipo: "sumiu", payload: {} } });
    const b = await db().job.create({ data: { tipo: "ping", payload: { origem: 42 } } });
    await executarLote();
    expect((await db().job.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("FALHOU");
    expect((await db().job.findUniqueOrThrow({ where: { id: b.id } })).erro).toContain("Payload inválido");
  });

  it("erro é truncado em 2 KB e sem URL assinada", async () => {
    const registro = registroDeTeste(async () => {
      throw new ErroPermanente(`https://r2.exemplo/a.jpg?X-Amz-Signature=abc ${"x".repeat(5000)}`);
    });
    const job = await enfileirarJob({ tipo: "teste", payload: { n: 1 } }, db(), registro);
    await executarLote({ registro });
    const { erro } = await db().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(erro!.length).toBeLessThanOrEqual(2048);
    expect(erro).not.toContain("X-Amz-Signature");
  });

  it("timeout com handler que ignora o signal: falha, lote encerrado, conclusão tardia não grava", async () => {
    let liberar: () => void = () => {};
    let sinal: AbortSignal | undefined;
    const registro = registroDeTeste(
      (_p, signal) => {
        sinal = signal;
        return new Promise((r) => (liberar = () => r({ tarde: true })));
      },
      { timeoutMs: 100 },
    );
    const primeiro = await enfileirarJob({ tipo: "teste", payload: { n: 1 } }, db(), registro);
    await enfileirarJob({ tipo: "teste", payload: { n: 2 } }, db(), registro);
    const ficha = { id: primeiro.id };

    const resumo = await executarLote({ registro });
    expect(resumo).toMatchObject({ executados: 1, falhas: 1, motivoFim: "timeout" });
    expect(sinal?.aborted).toBe(true);
    const apos = await db().job.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(apos.status).toBe("PENDENTE");
    expect(apos.erro).toContain("Tempo esgotado");
    expect(await db().job.count({ where: { status: "PENDENTE", tentativas: 0 } })).toBe(1);
    liberar();
  });

  it("não reivindica quando o tempo restante é menor que maior timeout + 1 min", async () => {
    await enfileirarJob({ tipo: "ping", payload: {} });
    const necessario = maiorTimeout(REGISTRO) + MARGEM_CLAIM_MS;
    const r1 = await executarLote({ orcamentoMs: necessario - 1 });
    expect(r1).toMatchObject({ executados: 0, motivoFim: "tempo" });
    expect(await contarVencidos()).toBe(1);
    // Relógio falso: começou há 13 min numa invocação de 15 (restam 2 < 2 + 1).
    const agora = 1_000_000;
    const r2 = await executarLote({ inicio: agora - 13 * 60_000, agora: () => agora, orcamentoMs: 15 * 60_000 });
    expect(r2.executados).toBe(0);
    const r3 = await executarLote({ inicio: agora - 60_000, agora: () => agora, orcamentoMs: 15 * 60_000 });
    expect(r3.executados).toBe(1);
  });
});

describe("posse do job (ficha = tentativas + lockedAt)", () => {
  it("executor A trava, recupera, B reivindica: A não altera, B conclui", async () => {
    const job = await enfileirarJob({ tipo: "ping", payload: {} });
    const a = (await reivindicarProximo())!;
    // A "some": simula lockedAt antigo.
    await db().job.update({
      where: { id: job.id },
      data: { lockedAt: new Date(Date.now() - PRAZO_RECUPERACAO_MS - 60_000) },
    });
    const aAntigo = { ...a.ficha, lockedAt: (await db().job.findUniqueOrThrow({ where: { id: job.id } })).lockedAt! };
    expect(await recuperarTravados()).toBe(1);
    expect((await db().job.findUniqueOrThrow({ where: { id: job.id } })).status).toBe("PENDENTE");
    await vencerAgora(job.id);
    const b = (await reivindicarProximo())!;
    expect(b.ficha.tentativas).toBe(2);

    expect(await concluir(aAntigo, { de: "A" })).toBe(false);
    expect(await registrarFalha(aAntigo, new Error("A"))).toBe("posse_perdida");
    expect(await concluir(b.ficha, { de: "B" })).toBe(true);
    expect((await db().job.findUniqueOrThrow({ where: { id: job.id } })).resultado).toEqual({ de: "B" });
  });

  it("reenfileirar após timeout (maxTentativas=1): o worker antigo não grava", async () => {
    const registro = registroDeTeste(() => new Promise(() => {}), { timeoutMs: 50, maxTentativas: 1 });
    const job = await enfileirarJob({ tipo: "teste", payload: { n: 1 } }, db(), registro);
    const antigo = (await reivindicarProximo())!;
    // Timeout do worker antigo marca FALHOU (tentativas esgotadas).
    expect(await registrarFalha(antigo.ficha, new Error("timeout"))).toBe("FALHOU");
    expect(await reenfileirarJob(job.id)).toBe(true);
    const novo = (await reivindicarProximo())!;
    // Mesmo número de tentativas (1), lockedAt diferente.
    expect(novo.ficha.tentativas).toBe(antigo.ficha.tentativas);
    expect(novo.ficha.lockedAt.getTime()).not.toBe(antigo.ficha.lockedAt.getTime());
    expect(await concluir(antigo.ficha, { de: "antigo" })).toBe(false);
    expect(await concluir(novo.ficha, { de: "novo" })).toBe(true);
    expect((await db().job.findUniqueOrThrow({ where: { id: job.id } })).resultado).toEqual({ de: "novo" });
  });

  it("recuperarTravados respeita o prazo e as tentativas", async () => {
    const velho = new Date(Date.now() - PRAZO_RECUPERACAO_MS - 60_000);
    const recente = new Date(Date.now() - 5 * 60_000);
    const [j1, j2, j3] = await Promise.all([
      db().job.create({ data: { tipo: "ping", payload: {}, status: "EXECUTANDO", tentativas: 1, lockedAt: velho } }),
      db().job.create({ data: { tipo: "ping", payload: {}, status: "EXECUTANDO", tentativas: 5, maxTentativas: 5, lockedAt: velho } }),
      db().job.create({ data: { tipo: "ping", payload: {}, status: "EXECUTANDO", tentativas: 1, lockedAt: recente } }),
    ]);
    expect(await recuperarTravados()).toBe(2);
    const st = async (id: string) => (await db().job.findUniqueOrThrow({ where: { id } })).status;
    expect(await st(j1.id)).toBe("PENDENTE");
    expect(await st(j2.id)).toBe("FALHOU");
    expect(await st(j3.id)).toBe("EXECUTANDO");
    expect(await contarAtivos()).toBe(1);
  });

  it("reenfileirar só vale para FALHOU ou CANCELADO", async () => {
    const job = await enfileirarJob({ tipo: "ping", payload: {} });
    expect(await reenfileirarJob(job.id)).toBe(false);
    await db().job.update({ where: { id: job.id }, data: { status: "CANCELADO", tentativas: 2, erro: "x" } });
    expect(await reenfileirarJob(job.id)).toBe(true);
    expect(await db().job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: "PENDENTE",
      tentativas: 0,
      erro: null,
    });
  });
});

describe("espera pedida pelo erro (429 com retry-after)", () => {
  it("registrarFalha usa max(backoff, esperaMs) e mantém PENDENTE", async () => {
    await enfileirarJob({ tipo: "ping", payload: {} });
    const { ficha } = (await reivindicarProximo())!;
    const antes = Date.now();
    expect(await registrarFalha(ficha, new ErroComEspera("ia:limite_taxa", 10 * 60_000), db(), () => 0.5)).toBe("PENDENTE");
    const job = await db().job.findUniqueOrThrow({ where: { id: ficha.id } });
    expect(job.executarEm.getTime() - antes).toBeGreaterThanOrEqual(10 * 60_000 - 2_000);
    expect(job.erro).toBe("ErroComEspera: ia:limite_taxa");
  });
});
