import type { PrismaClient } from "@/generated/prisma/client";
import { enfileirarJob } from "@/jobs/fila";
import { obterDb } from "@/lib/db";
import { dec, type Decimal, percentual } from "@/lib/dinheiro";
import { log } from "@/lib/log";
import { ID_CONFIGURACAO } from "./configuracao";

export const LIMIARES = [50, 80, 100] as const;
export const ESCOPO_GERAL = "geral";

/**
 * Para cada limiar atingido no mês, grava o alerta uma única vez
 * (INSERT ... ON CONFLICT DO NOTHING) e, se o alerta é novo e há e-mail de
 * notificação, enfileira o e-mail na MESMA transação. Seguro sob concorrência.
 * Escopos: "geral" (teto mensal) e cada conta com cota própria (escopo = id da conta).
 * Chave do e-mail: alerta:<mês>:<escopo>:<limiar>.
 */
export async function verificarAlertas(mes: string, db: PrismaClient = obterDb()): Promise<number[]> {
  return db.$transaction(async (tx) => {
    const config = await tx.configuracao.findUnique({ where: { id: ID_CONFIGURACAO } });
    if (!config) return [];
    const soma = await tx.geracaoIA.aggregate({ _sum: { custoBrl: true }, where: { mesReferencia: mes } });
    const escopos: { escopo: string; nomeConta?: string; gasto: Decimal; teto: Decimal }[] = [
      { escopo: ESCOPO_GERAL, gasto: dec(soma._sum.custoBrl ?? 0), teto: dec(config.tetoMensalBrl) },
    ];
    const contasComCota = await tx.contaInstagram.findMany({
      where: { tetoMensalBrl: { not: null } },
      select: { id: true, nome: true, tetoMensalBrl: true },
    });
    if (contasComCota.length > 0) {
      const porConta = await tx.geracaoIA.groupBy({
        by: ["contaId"],
        where: { mesReferencia: mes, contaId: { in: contasComCota.map((c) => c.id) } },
        _sum: { custoBrl: true },
      });
      for (const conta of contasComCota) {
        const gasto = dec(porConta.find((g) => g.contaId === conta.id)?._sum.custoBrl ?? 0);
        escopos.push({ escopo: conta.id, nomeConta: conta.nome, gasto, teto: dec(conta.tetoMensalBrl) });
      }
    }

    const criados: number[] = [];
    for (const { escopo, nomeConta, gasto, teto } of escopos) {
      const pct = percentual(gasto, teto);
      for (const limiar of LIMIARES) {
        if (pct.lt(limiar)) continue;
        const inseridos = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO "AlertaOrcamento" ("id", "mesReferencia", "escopo", "limiar", "percentual")
          VALUES (gen_random_uuid()::text, ${mes}, ${escopo}, ${limiar}, ${pct.toFixed(2)}::numeric)
          ON CONFLICT ("mesReferencia", "escopo", "limiar") DO NOTHING
          RETURNING "id"`;
        if (inseridos.length === 0) continue;
        if (escopo === ESCOPO_GERAL) criados.push(limiar);
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
                  tetoBrl: teto.toFixed(2),
                  escopo,
                  ...(nomeConta ? { nomeConta } : {}),
                },
              },
              chaveIdempotencia: `alerta:${mes}:${escopo}:${limiar}`,
            },
            tx,
          );
        }
        log.info("orçamento: alerta criado", { mes, escopo, limiar });
      }
    }
    return criados;
  });
}
