import type { PrismaClient } from "@/generated/prisma/client";
import { enfileirarJob } from "@/jobs/fila";
import { obterDb } from "@/lib/db";
import { dec, percentual } from "@/lib/dinheiro";
import { log } from "@/lib/log";
import { ID_CONFIGURACAO } from "./configuracao";

export const LIMIARES = [50, 80, 100] as const;
export const ESCOPO_GERAL = "geral";

/**
 * Para cada limiar atingido no mês, grava o alerta uma única vez
 * (INSERT ... ON CONFLICT DO NOTHING) e, se o alerta é novo e há e-mail de
 * notificação, enfileira o e-mail na MESMA transação. Seguro sob concorrência.
 * Nesta fase só o escopo geral; alertas por conta entram na fase 1.
 */
export async function verificarAlertas(mes: string, db: PrismaClient = obterDb()): Promise<number[]> {
  return db.$transaction(async (tx) => {
    const config = await tx.configuracao.findUnique({ where: { id: ID_CONFIGURACAO } });
    if (!config) return [];
    const soma = await tx.geracaoIA.aggregate({ _sum: { custoBrl: true }, where: { mesReferencia: mes } });
    const gasto = dec(soma._sum.custoBrl ?? 0);
    const pct = percentual(gasto, config.tetoMensalBrl);
    const criados: number[] = [];

    for (const limiar of LIMIARES) {
      if (pct.lt(limiar)) continue;
      const inseridos = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO "AlertaOrcamento" ("id", "mesReferencia", "escopo", "limiar", "percentual")
        VALUES (gen_random_uuid()::text, ${mes}, ${ESCOPO_GERAL}, ${limiar}, ${pct.toFixed(2)}::numeric)
        ON CONFLICT ("mesReferencia", "escopo", "limiar") DO NOTHING
        RETURNING "id"`;
      if (inseridos.length === 0) continue;
      criados.push(limiar);
      if (config.emailNotificacao) {
        await enfileirarJob(
          {
            tipo: "enviar-email",
            payload: {
              para: config.emailNotificacao,
              modelo: "alerta-orcamento",
              dados: {
                mesReferencia: mes,
                limiar,
                percentual: pct.toFixed(2),
                gastoBrl: gasto.toFixed(2),
                tetoBrl: dec(config.tetoMensalBrl).toFixed(2),
                escopo: ESCOPO_GERAL,
              },
            },
            chaveIdempotencia: `alerta:${mes}:${ESCOPO_GERAL}:${limiar}`,
          },
          tx,
        );
      }
    }
    if (criados.length > 0) log.info("orçamento: alertas criados", { mes, limiares: criados });
    return criados;
  });
}
