import { obterDb, type ClienteDb } from "@/lib/db";
import { log } from "@/lib/log";

/** Reservas ATIVA vencidas (execução que morreu sem conciliar nem liberar) → EXPIRADA. */
export async function expirarReservas(db: ClienteDb = obterDb(), agora = new Date()): Promise<number> {
  const { count } = await db.reservaOrcamento.updateMany({
    where: { status: "ATIVA", expiraEm: { lte: agora } },
    data: { status: "EXPIRADA", finalizadaEm: agora },
  });
  if (count > 0) log.info("orçamento: reservas expiradas", { total: count });
  return count;
}
