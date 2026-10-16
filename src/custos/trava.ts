import type { ClienteDb } from "@/lib/db";

/**
 * Trava global do orçamento (advisory lock da transação). Reservar e conciliar
 * pegam a mesma trava: as somas do comprometido nunca veem um estado
 * intermediário. Só dentro de $transaction (é liberada no commit/rollback).
 */
export async function travarOrcamento(tx: ClienteDb) {
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended('orcamento', 0))) AS trava`;
}
