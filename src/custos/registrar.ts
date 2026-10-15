import type { GeracaoIA, PrismaClient, TipoGeracao } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { mesReferencia } from "@/lib/datas";
import { obterDb } from "@/lib/db";
import { dec } from "@/lib/dinheiro";
import { log } from "@/lib/log";
import { verificarAlertas } from "./alertas";
import { calcularCusto, type Uso } from "./calcular";
import { obterConfiguracao } from "./configuracao";

export type DadosGeracao = {
  contaId?: string | null;
  especialista?: string;
  provedor: string;
  modelo: string;
  tipo: TipoGeracao;
  versaoPrompt?: string;
  uso: Uso;
};

/**
 * Registra o uso real de uma chamada de IA, com o custo calculado pela tabela
 * de preços e a cotação atuais (guardados como "foto" em precosAplicados).
 * Sem preço ou sem cotação: grava com custo nulo e precoPendente = true.
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
  const custo = calcularCusto(dados.uso, preco, config.cotacaoUsdBrl);
  const mes = mesReferencia(agora);

  const geracao = await db.geracaoIA.create({
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
      cotacaoUsada: config.cotacaoUsdBrl,
      precoPendente: !custo.ok,
      precosAplicados: preco
        ? {
            usdPorMTokEntrada: preco.usdPorMTokEntrada?.toString() ?? null,
            usdPorMTokSaida: preco.usdPorMTokSaida?.toString() ?? null,
            usdPorMTokCacheLeitura: preco.usdPorMTokCacheLeitura?.toString() ?? null,
            usdPorMTokCacheEscrita: preco.usdPorMTokCacheEscrita?.toString() ?? null,
            usdPorImagem: preco.usdPorImagem?.toString() ?? null,
            usdPorSegundoVideo: preco.usdPorSegundoVideo?.toString() ?? null,
            atualizadoEm: preco.atualizadoEm.toISOString(),
          }
        : Prisma.JsonNull,
      mesReferencia: mes,
      criadoEm: agora,
    },
  });

  if (!custo.ok) {
    log.warn("custo de IA sem preço", { provedor: dados.provedor, modelo: dados.modelo, faltando: custo.faltando });
  } else {
    await verificarAlertas(mes, db);
  }
  return geracao;
}
