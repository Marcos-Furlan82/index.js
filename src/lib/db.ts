import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { lerEnv } from "@/lib/env";

/** Cliente completo ou o cliente de uma transação. */
export type ClienteDb = PrismaClient | Prisma.TransactionClient;

const POOL_PADRAO_APP = 5;
const POOL_PADRAO_FUNCOES = 2;

let poolPadrao = POOL_PADRAO_APP;

const globalDb = globalThis as unknown as { __prisma?: PrismaClient };

export function criarDb(opcoes: { url?: string; poolMax?: number } = {}): PrismaClient {
  const env = lerEnv("banco");
  const adapter = new PrismaPg({
    connectionString: opcoes.url ?? env.DATABASE_URL,
    max: opcoes.poolMax ?? env.DB_POOL_MAX ?? poolPadrao,
  });
  return new PrismaClient({ adapter });
}

/** Cliente único por processo (no dev do Next, sobrevive ao hot reload). */
export function obterDb(): PrismaClient {
  if (!globalDb.__prisma) globalDb.__prisma = criarDb();
  return globalDb.__prisma;
}

/**
 * As funções do Netlify usam um pool menor (cada invocação pode abrir conexões).
 * Chame antes do primeiro obterDb() da função.
 */
export function usarPoolDasFuncoes() {
  poolPadrao = POOL_PADRAO_FUNCOES;
}

export async function desconectarDb() {
  if (globalDb.__prisma) {
    await globalDb.__prisma.$disconnect();
    globalDb.__prisma = undefined;
  }
}
