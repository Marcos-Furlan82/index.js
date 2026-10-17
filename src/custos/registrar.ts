import type { GeracaoIA, PrecoModelo, PrismaClient, TipoGeracao } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { mesReferencia } from "@/lib/datas";
import { obterDb } from "@/lib/db";
import { dec, type ValorDecimal } from "@/lib/dinheiro";
import { log } from "@/lib/log";
import { comRetryDeBanco } from "@/lib/retry-banco";
import { verificarAlertas } from "./alertas";
import { calcularCusto, type ResultadoCusto, type Uso } from "./calcular";
import { obterConfiguracao } from "./configuracao";
import { travarOrcamento } from "./trava";

export type DadosGeracao = {
  contaId?: string | null;
  especialista?: string;
  provedor: string;
  modelo: string;
  tipo: TipoGeracao;
  versaoPrompt?: string;
  uso: Uso;
};

function fotoDosPrecos(preco: PrecoModelo | null) {
  return preco
    ? {
        usdPorMTokEntrada: preco.usdPorMTokEntrada?.toString() ?? null,
        usdPorMTokSaida: preco.usdPorMTokSaida?.toString() ?? null,
        usdPorMTokCacheLeitura: preco.usdPorMTokCacheLeitura?.toString() ?? null,
        usdPorMTokCacheEscrita: preco.usdPorMTokCacheEscrita?.toString() ?? null,
        usdPorImagem: preco.usdPorImagem?.toString() ?? null,
        usdPorSegundoVideo: preco.usdPorSegundoVideo?.toString() ?? null,
        atualizadoEm: preco.atualizadoEm.toISOString(),
      }
    : Prisma.JsonNull;
}

/**
 * Monta a linha de GeracaoIA (função pura): custo pela tabela de preços e
 * cotação informadas, guardados como "foto" em precosAplicados.
 */
export function montarDadosGeracao(
  dados: DadosGeracao,
  preco: PrecoModelo | null,
  cotacaoUsdBrl: ValorDecimal | null,
  mes: string,
  agora: Date,
  reservaId: string | null = null,
): { data: Prisma.GeracaoIAUncheckedCreateInput; custo: ResultadoCusto } {
  const custo = calcularCusto(dados.uso, preco, cotacaoUsdBrl);
  return {
    custo,
    data: {
      contaId: dados.contaId ?? null,
      especialista: dados.especialista,
      provedor: dados.provedor,
      modelo: dados.modelo,
      tipo: dados.tipo,
      versaoPrompt: dados.versaoPrompt,
      tokensEntrada: dados.uso.tokensEntrada ?? 0,
      tokensSaida: dados.uso.tokensSaida ?? 0,
      tokensCacheLeitura: dados.uso.tokensCacheLeitura ?? 0,
      tokensCacheEscrita: dados.uso.tokensCacheEscrita ?? 0,
      imagens: dados.uso.imagens ?? 0,
      segundosVideo: dec(dados.uso.segundosVideo ?? 0),
      custoUsd: custo.ok ? custo.custoUsd : null,
      custoBrl: custo.ok ? custo.custoBrl : null,
      cotacaoUsada: cotacaoUsdBrl === null ? null : dec(cotacaoUsdBrl),
      precoPendente: !custo.ok,
      precosAplicados: fotoDosPrecos(preco),
      mesReferencia: mes,
      reservaId,
      criadoEm: agora,
    },
  };
}

/**
 * Registra o uso real de uma chamada de IA sem reserva (custo pela tabela e
 * cotação atuais). Sem preço ou sem cotação: custo nulo e precoPendente = true.
 */
export async function registrarCusto(
  dados: DadosGeracao,
  db: PrismaClient = obterDb(),
  agora = new Date(),
): Promise<GeracaoIA> {
  const config = await obterConfiguracao(db);
  const preco = await db.precoModelo.findUnique({
    where: { provedor_modelo: { provedor: dados.provedor, modelo: dados.modelo } },
  });
  const mes = mesReferencia(agora);
  const { data, custo } = montarDadosGeracao(dados, preco, config.cotacaoUsdBrl, mes, agora);
  const geracao = await db.geracaoIA.create({ data });

  if (!custo.ok) {
    log.warn("custo de IA sem preço", { provedor: dados.provedor, modelo: dados.modelo, faltando: custo.faltando });
  } else {
    await verificarAlertas(mes, db);
  }
  return geracao;
}

export type UsoDoModelo = { modelo: string; uso: Uso };

export type DadosConciliacao = {
  reservaId: string | null;
  contaId: string | null;
  especialista?: string;
  versaoPrompt?: string;
  provedor: string;
  tipo: TipoGeracao;
  /** Um item por modelo que rodou (o principal e, se houve, o de fallback). */
  usos: UsoDoModelo[];
};

/**
 * Grava o uso real (uma GeracaoIA por modelo, ligada à reserva) e concilia a
 * reserva na MESMA transação, com a mesma trava do orçamento usada ao reservar
 * (sem janela em que o valor some das somas). O mês é o da reserva.
 * - Algum modelo sem preço → reserva PENDENTE_PRECO (o valor reservado segue contando).
 * - Reserva já EXPIRADA/LIBERADA (execução órfã): grava mesmo assim e marca
 *   CONCILIADA; só registra um aviso.
 * Falha transitória do banco: até 3 novas tentativas locais. Alertas depois do commit.
 */
export async function registrarUsosEConciliar(
  dados: DadosConciliacao,
  db: PrismaClient = obterDb(),
  agora = new Date(),
  esperasRetry?: readonly number[],
): Promise<{ geracoes: GeracaoIA[]; mes: string; pendentePreco: boolean }> {
  const resultado = await comRetryDeBanco(
    () =>
      db.$transaction(async (tx) => {
        await travarOrcamento(tx);
        const config = await obterConfiguracao(tx);
        const reserva = dados.reservaId
          ? await tx.reservaOrcamento.findUnique({ where: { id: dados.reservaId } })
          : null;
        const mes = reserva?.mesReferencia ?? mesReferencia(agora);
        const precos = await tx.precoModelo.findMany({
          where: { provedor: dados.provedor, modelo: { in: dados.usos.map((u) => u.modelo) } },
        });
        const geracoes: GeracaoIA[] = [];
        for (const item of dados.usos) {
          const preco = precos.find((p) => p.modelo === item.modelo) ?? null;
          const { data } = montarDadosGeracao(
            {
              contaId: dados.contaId,
              especialista: dados.especialista,
              versaoPrompt: dados.versaoPrompt,
              provedor: dados.provedor,
              tipo: dados.tipo,
              modelo: item.modelo,
              uso: item.uso,
            },
            preco,
            config.cotacaoUsdBrl,
            mes,
            agora,
            reserva?.id ?? null,
          );
          geracoes.push(await tx.geracaoIA.create({ data }));
        }
        const pendentePreco = geracoes.some((g) => g.precoPendente);
        if (reserva) {
          if (reserva.status !== "ATIVA") {
            log.warn("orçamento: conciliação de reserva já finalizada", {
              reservaId: reserva.id,
              statusAnterior: reserva.status,
            });
          }
          await tx.reservaOrcamento.update({
            where: { id: reserva.id },
            data: { status: pendentePreco ? "PENDENTE_PRECO" : "CONCILIADA", finalizadaEm: agora },
          });
        }
        return { geracoes, mes, pendentePreco };
      }),
    esperasRetry,
  );

  if (resultado.pendentePreco) {
    log.warn("custo de IA sem preço", {
      provedor: dados.provedor,
      modelos: resultado.geracoes.filter((g) => g.precoPendente).map((g) => g.modelo),
    });
  }
  if (resultado.geracoes.some((g) => !g.precoPendente)) {
    try {
      await verificarAlertas(resultado.mes, db);
    } catch (erro) {
      log.error("orçamento: falha ao verificar alertas", { erro });
    }
  }
  return resultado;
}

/**
 * Depois de cadastrar o preço de um modelo: calcula o custo das gerações que
 * estavam sem preço e concilia as reservas PENDENTE_PRECO que ficaram completas.
 */
export async function recalcularGeracoesSemPreco(
  provedor: string,
  modelo: string,
  db: PrismaClient = obterDb(),
): Promise<{ geracoes: number; reservas: number }> {
  const resultado = await db.$transaction(async (tx) => {
    await travarOrcamento(tx);
    const config = await obterConfiguracao(tx);
    const preco = await tx.precoModelo.findUnique({ where: { provedor_modelo: { provedor, modelo } } });
    const pendentes = await tx.geracaoIA.findMany({ where: { provedor, modelo, precoPendente: true } });
    let atualizadas = 0;
    const meses = new Set<string>();
    const reservas = new Set<string>();
    for (const g of pendentes) {
      const custo = calcularCusto(
        {
          tokensEntrada: g.tokensEntrada,
          tokensSaida: g.tokensSaida,
          tokensCacheLeitura: g.tokensCacheLeitura,
          tokensCacheEscrita: g.tokensCacheEscrita,
          imagens: g.imagens,
          segundosVideo: g.segundosVideo,
        },
        preco,
        config.cotacaoUsdBrl,
      );
      if (!custo.ok) continue;
      await tx.geracaoIA.update({
        where: { id: g.id },
        data: {
          custoUsd: custo.custoUsd,
          custoBrl: custo.custoBrl,
          cotacaoUsada: config.cotacaoUsdBrl,
          precoPendente: false,
          precosAplicados: fotoDosPrecos(preco),
        },
      });
      atualizadas++;
      meses.add(g.mesReferencia);
      if (g.reservaId) reservas.add(g.reservaId);
    }
    let conciliadas = 0;
    for (const reservaId of reservas) {
      const aindaPendentes = await tx.geracaoIA.count({ where: { reservaId, precoPendente: true } });
      if (aindaPendentes > 0) continue;
      const { count } = await tx.reservaOrcamento.updateMany({
        where: { id: reservaId, status: "PENDENTE_PRECO" },
        data: { status: "CONCILIADA" },
      });
      conciliadas += count;
    }
    return { geracoes: atualizadas, reservas: conciliadas, meses: [...meses] };
  });
  for (const mes of resultado.meses) await verificarAlertas(mes, db);
  return { geracoes: resultado.geracoes, reservas: resultado.reservas };
}

