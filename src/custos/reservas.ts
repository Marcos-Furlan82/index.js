import type { PrismaClient } from "@/generated/prisma/client";
import { mesReferencia } from "@/lib/datas";
import { obterDb, type ClienteDb } from "@/lib/db";
import { dec, type ValorDecimal } from "@/lib/dinheiro";
import { log } from "@/lib/log";
import { avaliarGasto, type DecisaoGasto } from "./orcamento";
import { travarOrcamento } from "./trava";

/**
 * Reserva de orçamento: antes de chamar a IA, separa o custo MÁXIMO previsto,
 * sob a trava global do orçamento (10 pedidos simultâneos com saldo para 3
 * resultam em exatamente 3 reservas). Depois da chamada:
 * - registrarUsosEConciliar (src/custos/registrar.ts) grava o custo real e
 *   marca CONCILIADA (ou PENDENTE_PRECO);
 * - liberarReserva quando a chamada comprovadamente não foi cobrada;
 * - se nada disso acontecer (processo morreu), a reserva expira sozinha.
 */

export type ResultadoReserva =
  | { ok: true; reservaId: string; mesReferencia: string; decisao: DecisaoGasto }
  | { ok: false; decisao: DecisaoGasto };

export async function reservarOrcamento(
  pedido: { contaId: string | null; valorBrl: ValorDecimal; validadeMs: number; origem: string },
  db: PrismaClient = obterDb(),
  agora = new Date(),
): Promise<ResultadoReserva> {
  return db.$transaction(async (tx) => {
    await travarOrcamento(tx);
    const decisao = await avaliarGasto(tx, pedido.contaId, pedido.valorBrl, agora);
    if (!decisao.permitido) return { ok: false as const, decisao };
    const mes = mesReferencia(agora);
    const reserva = await tx.reservaOrcamento.create({
      data: {
        contaId: pedido.contaId,
        mesReferencia: mes,
        valorBrl: dec(pedido.valorBrl),
        expiraEm: new Date(agora.getTime() + pedido.validadeMs),
        origem: pedido.origem,
        criadoEm: agora,
      },
    });
    return { ok: true as const, reservaId: reserva.id, mesReferencia: mes, decisao };
  });
}

/** Devolve o valor ao orçamento. Idempotente: só age em reserva ATIVA. */
export async function liberarReserva(reservaId: string, db: ClienteDb = obterDb(), agora = new Date()) {
  const { count } = await db.reservaOrcamento.updateMany({
    where: { id: reservaId, status: "ATIVA" },
    data: { status: "LIBERADA", finalizadaEm: agora },
  });
  return count > 0;
}

/** Reservas ATIVA vencidas (execução que morreu sem conciliar nem liberar) → EXPIRADA. */
export async function expirarReservas(db: ClienteDb = obterDb(), agora = new Date()): Promise<number> {
  const { count } = await db.reservaOrcamento.updateMany({
    where: { status: "ATIVA", expiraEm: { lte: agora } },
    data: { status: "EXPIRADA", finalizadaEm: agora },
  });
  if (count > 0) log.info("orçamento: reservas expiradas", { total: count });
  return count;
}
