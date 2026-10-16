import type { Job } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { obterDb, type ClienteDb } from "@/lib/db";
import { log, redigirTexto } from "@/lib/log";
import { atrasoParaErro } from "./backoff";
import { ErroPermanente } from "./erros";
import { MAX_TENTATIVAS_PADRAO, PRAZO_RECUPERACAO_MS, TAMANHO_MAX_ERRO } from "./limites";
import { REGISTRO } from "./registro";
import type { Registro } from "./tipos";

/**
 * Fila de jobs no Postgres.
 *
 * Posse: ao reivindicar, o job recebe status EXECUTANDO, tentativas+1 e um
 * lockedAt novo. A "ficha de posse" (id + tentativas + lockedAt) acompanha o
 * job; concluir/registrarFalha só gravam se a ficha ainda bate. Assim, um
 * executor que perdeu o job (timeout, recuperação, reenvio) não sobrescreve
 * o resultado de outro.
 */

export type FichaPosse = {
  id: string;
  tipo: string;
  tentativas: number;
  maxTentativas: number;
  lockedAt: Date;
};

export type NovoJob = {
  tipo: string;
  payload: unknown;
  contaId?: string | null;
  executarEm?: Date;
  chaveIdempotencia?: string;
  maxTentativas?: number;
};

export async function enfileirarJob(
  novo: NovoJob,
  db: ClienteDb = obterDb(),
  registro: Registro = REGISTRO,
): Promise<Job> {
  const def = registro[novo.tipo];
  if (!def) throw new Error(`Tipo de job desconhecido: ${novo.tipo}`);
  const payload = def.schema.safeParse(novo.payload);
  if (!payload.success) {
    throw new Error(`Payload inválido para o job ${novo.tipo}: ${payload.error.message}`);
  }
  const dados = {
    tipo: novo.tipo,
    payload: payload.data as Prisma.InputJsonValue,
    contaId: novo.contaId ?? null,
    executarEm: novo.executarEm,
    maxTentativas: novo.maxTentativas ?? def.maxTentativas ?? MAX_TENTATIVAS_PADRAO,
    chaveIdempotencia: novo.chaveIdempotencia ?? null,
  };
  if (!novo.chaveIdempotencia) return db.job.create({ data: dados });

  // Chave repetida devolve SEMPRE o job existente, mesmo que tenha falhado.
  // Reabrir é explícito (reenfileirarJob), para não republicar sem querer.
  await db.job.createMany({ data: [dados], skipDuplicates: true });
  return db.job.findUniqueOrThrow({ where: { chaveIdempotencia: novo.chaveIdempotencia } });
}

/** Reivindica o próximo job vencido (uma única instrução, SKIP LOCKED). */
export async function reivindicarProximo(
  db: ClienteDb = obterDb(),
): Promise<{ job: Job; ficha: FichaPosse } | null> {
  const linhas = await db.$queryRaw<{ id: string }[]>`
    UPDATE "Job"
       SET "status" = 'EXECUTANDO',
           "tentativas" = "tentativas" + 1,
           "lockedAt" = now(),
           "iniciadoEm" = COALESCE("iniciadoEm", now()),
           "atualizadoEm" = now()
     WHERE "id" = (
       SELECT "id" FROM "Job"
        WHERE "status" = 'PENDENTE' AND "executarEm" <= now()
        ORDER BY "executarEm", "criadoEm"
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING "id"`;
  if (linhas.length === 0) return null;
  const job = await db.job.findUniqueOrThrow({ where: { id: linhas[0].id } });
  return { job, ficha: fichaDe(job) };
}

function fichaDe(job: Job): FichaPosse {
  if (!job.lockedAt) throw new Error("Job reivindicado sem lockedAt");
  return {
    id: job.id,
    tipo: job.tipo,
    tentativas: job.tentativas,
    maxTentativas: job.maxTentativas,
    lockedAt: job.lockedAt,
  };
}

function guardaDePosse(ficha: FichaPosse) {
  return {
    id: ficha.id,
    status: "EXECUTANDO" as const,
    tentativas: ficha.tentativas,
    lockedAt: ficha.lockedAt,
  };
}

function avisarPossePerdida(ficha: FichaPosse, operacao: string) {
  log.warn("job: posse perdida, resultado descartado", {
    jobId: ficha.id,
    tipo: ficha.tipo,
    tentativas: ficha.tentativas,
    operacao,
  });
}

export async function concluir(
  ficha: FichaPosse,
  resultado: unknown,
  db: ClienteDb = obterDb(),
): Promise<boolean> {
  const { count } = await db.job.updateMany({
    where: guardaDePosse(ficha),
    data: {
      status: "CONCLUIDO",
      resultado: (resultado ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      erro: null,
      lockedAt: null,
      concluidoEm: new Date(),
    },
  });
  if (count === 0) avisarPossePerdida(ficha, "concluir");
  return count > 0;
}

export function textoDoErro(erro: unknown): string {
  const bruto =
    erro instanceof Error ? `${erro.name}: ${erro.message}` : typeof erro === "string" ? erro : JSON.stringify(erro);
  const limpo = redigirTexto(bruto ?? "erro desconhecido");
  return limpo.length > TAMANHO_MAX_ERRO ? `${limpo.slice(0, TAMANHO_MAX_ERRO - 3)}...` : limpo;
}

/**
 * Falha: ErroPermanente ou tentativas esgotadas → FALHOU.
 * Senão volta para PENDENTE com espera exponencial (ou a espera pedida por
 * ErroComEspera, se for maior).
 */
export async function registrarFalha(
  ficha: FichaPosse,
  erro: unknown,
  db: ClienteDb = obterDb(),
  aleatorio: () => number = Math.random,
): Promise<"FALHOU" | "PENDENTE" | "posse_perdida"> {
  const definitivo = erro instanceof ErroPermanente || ficha.tentativas >= ficha.maxTentativas;
  const texto = textoDoErro(erro);
  const atrasoMs = definitivo ? 0 : atrasoParaErro(ficha.tentativas, erro, aleatorio);
  const novoStatus = definitivo ? "FALHOU" : "PENDENTE";
  const alteradas = await db.$executeRaw`
    UPDATE "Job"
       SET "status" = ${novoStatus}::"StatusJob",
           "erro" = ${texto},
           "lockedAt" = NULL,
           "executarEm" = CASE WHEN ${definitivo} THEN "executarEm"
                               ELSE now() + make_interval(secs => ${atrasoMs / 1000}) END,
           "concluidoEm" = CASE WHEN ${definitivo} THEN now() ELSE NULL END,
           "atualizadoEm" = now()
     WHERE "id" = ${ficha.id}
       AND "status" = 'EXECUTANDO'
       AND "tentativas" = ${ficha.tentativas}
       AND "lockedAt" = ${ficha.lockedAt}`;
  if (alteradas === 0) {
    avisarPossePerdida(ficha, "registrarFalha");
    return "posse_perdida";
  }
  log.info("job: falha registrada", {
    jobId: ficha.id,
    tipo: ficha.tipo,
    tentativas: ficha.tentativas,
    novoStatus,
  });
  return novoStatus;
}

/** Jobs EXECUTANDO há mais que o prazo (executor morreu): mesma regra de falha. */
export async function recuperarTravados(db: ClienteDb = obterDb()): Promise<number> {
  const prazoSeg = PRAZO_RECUPERACAO_MS / 1000;
  const travados = await db.$queryRaw<
    { id: string; tipo: string; tentativas: number; maxTentativas: number; lockedAt: Date }[]
  >`
    SELECT "id", "tipo", "tentativas", "maxTentativas", "lockedAt"
      FROM "Job"
     WHERE "status" = 'EXECUTANDO'
       AND "lockedAt" < now() - make_interval(secs => ${prazoSeg})`;
  let recuperados = 0;
  for (const ficha of travados) {
    const r = await registrarFalha(ficha, new Error("Executor não respondeu (job travado)"), db);
    if (r !== "posse_perdida") recuperados++;
  }
  return recuperados;
}

export async function contarVencidos(db: ClienteDb = obterDb()): Promise<number> {
  const [{ total }] = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total FROM "Job"
     WHERE "status" = 'PENDENTE' AND "executarEm" <= now()`;
  return total;
}

/** Executores ainda dentro do prazo (contam contra o paralelismo). */
export async function contarAtivos(db: ClienteDb = obterDb()): Promise<number> {
  const prazoSeg = PRAZO_RECUPERACAO_MS / 1000;
  const [{ total }] = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total FROM "Job"
     WHERE "status" = 'EXECUTANDO'
       AND "lockedAt" > now() - make_interval(secs => ${prazoSeg})`;
  return total;
}

/** Reenvio explícito (botão "Tentar de novo"): só de FALHOU ou CANCELADO. */
export async function reenfileirarJob(id: string, db: ClienteDb = obterDb()): Promise<boolean> {
  const { count } = await db.job.updateMany({
    where: { id, status: { in: ["FALHOU", "CANCELADO"] } },
    data: {
      status: "PENDENTE",
      tentativas: 0,
      erro: null,
      resultado: Prisma.DbNull,
      executarEm: new Date(),
      lockedAt: null,
      concluidoEm: null,
    },
  });
  return count > 0;
}
