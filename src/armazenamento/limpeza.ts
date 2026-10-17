import { obterDb, type ClienteDb } from "@/lib/db";
import { log } from "@/lib/log";
import { removerObjeto } from "./r2";

export const PRAZO_PENDENTE_MS = 24 * 60 * 60 * 1000;
export const PRAZO_REJEITADA_MS = 7 * 24 * 60 * 60 * 1000;
export const TAMANHO_LOTE_LIMPEZA = 100;
const MAX_LOTES = 50;

/**
 * Uploads que ficaram PENDENTE por mais de 24 h (o navegador não terminou):
 * apaga o objeto no bucket certo (inexistente não é erro) e depois a linha.
 * Em lotes de 100. Idempotente.
 */
export async function limparMidiasPendentes(db: ClienteDb = obterDb(), agora = new Date()): Promise<number> {
  const limite = new Date(agora.getTime() - PRAZO_PENDENTE_MS);
  let total = 0;
  for (let lote = 0; lote < MAX_LOTES; lote++) {
    const midias = await db.midia.findMany({
      where: { status: "PENDENTE", criadoEm: { lt: limite } },
      orderBy: { criadoEm: "asc" },
      take: TAMANHO_LOTE_LIMPEZA,
      select: { id: true, chave: true, privada: true, miniaturaChave: true },
    });
    if (midias.length === 0) break;
    for (const m of midias) {
      const area = m.privada ? "privada" : "publica";
      await removerObjeto(m.chave, area);
      if (m.miniaturaChave) await removerObjeto(m.miniaturaChave, area);
    }
    const { count } = await db.midia.deleteMany({
      where: { id: { in: midias.map((m) => m.id) }, status: "PENDENTE" },
    });
    total += count;
    if (midias.length < TAMANHO_LOTE_LIMPEZA) break;
  }
  if (total > 0) log.info("limpeza: uploads pendentes removidos", { total });
  return total;
}

/** Linhas REJEITADA com mais de 7 dias (o objeto já foi apagado na rejeição). */
export async function limparMidiasRejeitadas(db: ClienteDb = obterDb(), agora = new Date()): Promise<number> {
  const limite = new Date(agora.getTime() - PRAZO_REJEITADA_MS);
  const { count } = await db.midia.deleteMany({ where: { status: "REJEITADA", criadoEm: { lt: limite } } });
  if (count > 0) log.info("limpeza: mídias rejeitadas removidas", { total: count });
  return count;
}
