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

  return {
    mes,
    tetoBrl,
    gastoBrl,
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

export type DecisaoGasto = {
  permitido: boolean;
  acao: AcaoAoAtingirTeto;
  saldoGeralBrl: Decimal;
  saldoContaBrl?: Decimal;
  motivo?: "orcamento_nao_configurado" | "teto_geral" | "teto_conta";
  geracoesSemPreco: number;
};

/**
 * Pode gastar `custoPrevistoBrl` agora? Usada antes de gerar com IA.
 * - Sem cotação ou sem preços: não (orcamento_nao_configurado).
 * - gasto do mês + previsto <= teto geral.
 * - Se a conta tem cota: gasto da conta + previsto <= cota.
 * `acao` diz o que fazer quando não pode (quem chama troca o formato, se for o caso).
 * Publicação nunca passa por aqui.
 */
export async function podeGastar(
  contaId: string | null,
  custoPrevistoBrl: ValorDecimal,
  db: ClienteDb = obterDb(),
  agora = new Date(),
): Promise<DecisaoGasto> {
  const mes = mesReferencia(agora);
  const config = await obterConfiguracao(db);
  const previsto = dec(custoPrevistoBrl);
  const gastoGeral = await somaCustoBrl(db, mes);
  const saldoGeralBrl = arredondar2(dec(config.tetoMensalBrl).sub(gastoGeral));
  const geracoesSemPreco = await contarGeracoesSemPreco(db, mes);
  const base = { acao: config.acaoAoAtingirTeto, saldoGeralBrl, geracoesSemPreco };

  if (!(await orcamentoConfigurado(db, config.cotacaoUsdBrl))) {
    return { ...base, permitido: false, motivo: "orcamento_nao_configurado" };
  }

  let saldoContaBrl: Decimal | undefined;
  if (contaId) {
    const conta = await db.contaInstagram.findUnique({ where: { id: contaId }, select: { tetoMensalBrl: true } });
    if (conta?.tetoMensalBrl) {
      saldoContaBrl = arredondar2(dec(conta.tetoMensalBrl).sub(await somaCustoBrl(db, mes, contaId)));
    }
  }

  if (arredondar2(gastoGeral.add(previsto)).gt(arredondar2(config.tetoMensalBrl))) {
    return { ...base, saldoContaBrl, permitido: false, motivo: "teto_geral" };
  }
  if (saldoContaBrl !== undefined && arredondar2(previsto).gt(saldoContaBrl)) {
    return { ...base, saldoContaBrl, permitido: false, motivo: "teto_conta" };
  }
  return { ...base, saldoContaBrl, permitido: true };
}
