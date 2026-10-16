import type { AcaoAoAtingirTeto, AlertaOrcamento, TipoGeracao } from "@/generated/prisma/client";
import { diaDoMes, diasNoMes, mesReferencia } from "@/lib/datas";
import { obterDb, type ClienteDb } from "@/lib/db";
import { arredondar2, dec, Decimal, percentual, type ValorDecimal } from "@/lib/dinheiro";
import { cotacaoDesatualizada, obterConfiguracao } from "./configuracao";

export const DIAS_PROJECAO_POUCO_CONFIAVEL = 3;

async function somaCustoBrl(db: ClienteDb, mes: string, contaId?: string | null): Promise<Decimal> {
  const r = await db.geracaoIA.aggregate({
    _sum: { custoBrl: true },
    where: { mesReferencia: mes, ...(contaId ? { contaId } : {}) },
  });
  return dec(r._sum.custoBrl ?? 0);
}

export async function contarGeracoesSemPreco(db: ClienteDb, mes: string): Promise<number> {
  return db.geracaoIA.count({ where: { mesReferencia: mes, precoPendente: true } });
}

/** Configurado = tem cotação e ao menos um preço cadastrado. */
export async function orcamentoConfigurado(db: ClienteDb, cotacao: unknown): Promise<boolean> {
  if (cotacao === null || cotacao === undefined) return false;
  return (await db.precoModelo.count()) > 0;
}

/** Projeção linear: gasto ÷ dias decorridos (dia do mês em SP) × dias do mês. */
export function projecaoDoMes(gastoBrl: ValorDecimal, diaAtual: number, totalDias: number) {
  const dias = Math.max(1, diaAtual);
  return {
    valorBrl: dec(gastoBrl).div(dias).mul(totalDias),
    poucoConfiavel: dias <= DIAS_PROJECAO_POUCO_CONFIAVEL,
  };
}

export type ResumoMes = {
  mes: string;
  tetoBrl: Decimal;
  gastoBrl: Decimal;
  percentual: Decimal;
  saldoBrl: Decimal;
  porTipo: Record<TipoGeracao, Decimal>;
  porConta: { contaId: string | null; nome: string; gastoBrl: Decimal; tetoBrl: Decimal | null }[];
  /** Reservas que ainda contam (gerações em andamento ou com modelo sem preço). */
  reservadoBrl: Decimal;
  /** Divisão por conta: todas as contas não arquivadas, com gasto, reservado e cota. */
  divisao: {
    contaId: string;
    nome: string;
    gastoBrl: Decimal;
    reservadoBrl: Decimal;
    tetoBrl: Decimal | null;
    percentual: Decimal | null;
  }[];
  /** Soma das cotas por conta (aviso se passar do teto geral). */
  somaCotasBrl: Decimal;
  projecao: { valorBrl: Decimal; poucoConfiavel: boolean };
  geracoesSemPreco: number;
  configurado: boolean;
  cotacaoDesatualizada: boolean;
  alertas: AlertaOrcamento[];
};

export async function resumoDoMes(db: ClienteDb = obterDb(), agora = new Date()): Promise<ResumoMes> {
  const mes = mesReferencia(agora);
  const config = await obterConfiguracao(db);
  const tetoBrl = dec(config.tetoMensalBrl);
  const gastoBrl = await somaCustoBrl(db, mes);

  const tipos = await db.geracaoIA.groupBy({
    by: ["tipo"],
    where: { mesReferencia: mes },
    _sum: { custoBrl: true },
  });
  const porTipo: Record<TipoGeracao, Decimal> = { TEXTO: dec(0), IMAGEM: dec(0), VIDEO: dec(0) };
  for (const t of tipos) porTipo[t.tipo] = dec(t._sum.custoBrl ?? 0);

  const grupos = await db.geracaoIA.groupBy({
    by: ["contaId"],
    where: { mesReferencia: mes },
    _sum: { custoBrl: true },
  });
  const contas = await db.contaInstagram.findMany({
    where: { id: { in: grupos.map((g) => g.contaId).filter((id): id is string => !!id) } },
    select: { id: true, nome: true, tetoMensalBrl: true },
  });
  const porConta = grupos.map((g) => {
    const conta = contas.find((c) => c.id === g.contaId);
    return {
      contaId: g.contaId,
      nome: conta?.nome ?? "Sem conta",
      gastoBrl: dec(g._sum.custoBrl ?? 0),
      tetoBrl: conta?.tetoMensalBrl ? dec(conta.tetoMensalBrl) : null,
    };
  });

  const reservasAtivas = {
    mesReferencia: mes,
    OR: [{ status: "ATIVA" as const, expiraEm: { gt: agora } }, { status: "PENDENTE_PRECO" as const }],
  };
  const [reservado, reservadoPorConta, contasAtivas] = await Promise.all([
    db.reservaOrcamento.aggregate({ _sum: { valorBrl: true }, where: reservasAtivas }),
    db.reservaOrcamento.groupBy({ by: ["contaId"], where: reservasAtivas, _sum: { valorBrl: true } }),
    db.contaInstagram.findMany({
      where: { arquivadaEm: null },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, tetoMensalBrl: true },
    }),
  ]);
  const divisao = contasAtivas.map((c) => {
    const gasto = dec(grupos.find((g) => g.contaId === c.id)?._sum.custoBrl ?? 0);
    const teto = c.tetoMensalBrl ? dec(c.tetoMensalBrl) : null;
    return {
      contaId: c.id,
      nome: c.nome,
      gastoBrl: gasto,
      reservadoBrl: dec(reservadoPorConta.find((r) => r.contaId === c.id)?._sum.valorBrl ?? 0),
      tetoBrl: teto,
      percentual: teto ? percentual(gasto, teto) : null,
    };
  });
  const somaCotasBrl = divisao.reduce((soma, c) => soma.add(c.tetoBrl ?? 0), dec(0));

  return {
    mes,
    tetoBrl,
    gastoBrl,
    reservadoBrl: dec(reservado._sum.valorBrl ?? 0),
    divisao,
    somaCotasBrl,
    percentual: percentual(gastoBrl, tetoBrl),
    saldoBrl: tetoBrl.sub(gastoBrl),
    porTipo,
    porConta,
    projecao: projecaoDoMes(gastoBrl, diaDoMes(agora), diasNoMes(mes)),
    geracoesSemPreco: await contarGeracoesSemPreco(db, mes),
    configurado: await orcamentoConfigurado(db, config.cotacaoUsdBrl),
    cotacaoDesatualizada: cotacaoDesatualizada(config, agora),
    alertas: await db.alertaOrcamento.findMany({ where: { mesReferencia: mes }, orderBy: { limiar: "asc" } }),
  };
}

export type MotivoBloqueio = "orcamento_nao_configurado" | "teto_geral" | "teto_conta";

export type DecisaoGasto = {
  permitido: boolean;
  acao: AcaoAoAtingirTeto;
  saldoGeralBrl: Decimal;
  saldoContaBrl?: Decimal;
  /** Gasto + reservado no mês (geral). */
  comprometidoGeralBrl: Decimal;
  tetoGeralBrl: Decimal;
  motivo?: MotivoBloqueio;
  geracoesSemPreco: number;
};

/**
 * Comprometido no mês = gasto real (Σ GeracaoIA.custoBrl) + reservas que ainda
 * contam (ATIVA dentro da validade ou PENDENTE_PRECO). Numa única instrução SQL
 * (um só snapshot), geral e da conta.
 */
export async function comprometidoNoMes(
  db: ClienteDb,
  mes: string,
  contaId: string | null,
  agora = new Date(),
): Promise<{ geral: Decimal; conta: Decimal; reservadoGeral: Decimal }> {
  const [linha] = await db.$queryRaw<{ gasto: string; reservado: string; gastoConta: string; reservadoConta: string }[]>`
    SELECT
      (SELECT COALESCE(SUM("custoBrl"), 0) FROM "GeracaoIA"
        WHERE "mesReferencia" = ${mes})::text AS "gasto",
      (SELECT COALESCE(SUM("valorBrl"), 0) FROM "ReservaOrcamento"
        WHERE "mesReferencia" = ${mes}
          AND (("status" = 'ATIVA' AND "expiraEm" > ${agora}) OR "status" = 'PENDENTE_PRECO'))::text AS "reservado",
      (SELECT COALESCE(SUM("custoBrl"), 0) FROM "GeracaoIA"
        WHERE "mesReferencia" = ${mes} AND "contaId" = ${contaId})::text AS "gastoConta",
      (SELECT COALESCE(SUM("valorBrl"), 0) FROM "ReservaOrcamento"
        WHERE "mesReferencia" = ${mes} AND "contaId" = ${contaId}
          AND (("status" = 'ATIVA' AND "expiraEm" > ${agora}) OR "status" = 'PENDENTE_PRECO'))::text AS "reservadoConta"`;
  return {
    geral: dec(linha.gasto).add(dec(linha.reservado)),
    conta: dec(linha.gastoConta).add(dec(linha.reservadoConta)),
    reservadoGeral: dec(linha.reservado),
  };
}

/**
 * Regra única do orçamento (usada por podeGastar e, sob trava, por reservarOrcamento):
 * - Sem cotação ou sem preços: não (orcamento_nao_configurado).
 * - comprometido do mês + previsto <= teto geral.
 * - Se a conta tem cota: comprometido da conta + previsto <= cota.
 */
export async function avaliarGasto(
  db: ClienteDb,
  contaId: string | null,
  custoPrevistoBrl: ValorDecimal,
  agora = new Date(),
): Promise<DecisaoGasto> {
  const mes = mesReferencia(agora);
  const config = await obterConfiguracao(db);
  const previsto = dec(custoPrevistoBrl);
  const comprometido = await comprometidoNoMes(db, mes, contaId, agora);
  const tetoGeralBrl = arredondar2(config.tetoMensalBrl);
  const saldoGeralBrl = arredondar2(dec(config.tetoMensalBrl).sub(comprometido.geral));
  const geracoesSemPreco = await contarGeracoesSemPreco(db, mes);
  const base = {
    acao: config.acaoAoAtingirTeto,
    saldoGeralBrl,
    comprometidoGeralBrl: comprometido.geral,
    tetoGeralBrl,
    geracoesSemPreco,
  };

  if (!(await orcamentoConfigurado(db, config.cotacaoUsdBrl))) {
    return { ...base, permitido: false, motivo: "orcamento_nao_configurado" };
  }

  let saldoContaBrl: Decimal | undefined;
  if (contaId) {
    const conta = await db.contaInstagram.findUnique({ where: { id: contaId }, select: { tetoMensalBrl: true } });
    if (conta?.tetoMensalBrl) {
      saldoContaBrl = arredondar2(dec(conta.tetoMensalBrl).sub(comprometido.conta));
    }
  }

  if (arredondar2(comprometido.geral.add(previsto)).gt(tetoGeralBrl)) {
    return { ...base, saldoContaBrl, permitido: false, motivo: "teto_geral" };
  }
  if (saldoContaBrl !== undefined && arredondar2(previsto).gt(saldoContaBrl)) {
    return { ...base, saldoContaBrl, permitido: false, motivo: "teto_conta" };
  }
  return { ...base, saldoContaBrl, permitido: true };
}

/**
 * Pode gastar `custoPrevistoBrl` agora? Leitura para a interface (sem trava).
 * Quem vai gastar de fato usa reservarOrcamento (src/custos/reservas.ts).
 * `acao` diz o que fazer quando não pode. Publicação nunca passa por aqui.
 */
export async function podeGastar(
  contaId: string | null,
  custoPrevistoBrl: ValorDecimal,
  db: ClienteDb = obterDb(),
  agora = new Date(),
): Promise<DecisaoGasto> {
  return avaliarGasto(db, contaId, custoPrevistoBrl, agora);
}
