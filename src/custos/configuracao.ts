import type { Configuracao } from "@/generated/prisma/client";
import { obterDb, type ClienteDb } from "@/lib/db";

export const ID_CONFIGURACAO = "global";
export const DIAS_COTACAO_DESATUALIZADA = 30;

/** Lê a configuração global; cria com os padrões se o seed não rodou. */
export async function obterConfiguracao(db: ClienteDb = obterDb()): Promise<Configuracao> {
  return db.configuracao.upsert({
    where: { id: ID_CONFIGURACAO },
    update: {},
    create: { id: ID_CONFIGURACAO },
  });
}

export function cotacaoDesatualizada(config: Pick<Configuracao, "cotacaoAtualizadaEm">, agora = new Date()) {
  if (!config.cotacaoAtualizadaEm) return true;
  return agora.getTime() - config.cotacaoAtualizadaEm.getTime() > DIAS_COTACAO_DESATUALIZADA * 24 * 60 * 60 * 1000;
}
