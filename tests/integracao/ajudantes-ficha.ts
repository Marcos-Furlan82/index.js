import { salvarRespostasBriefing } from "@/briefing/salvar";
import { criarConta } from "@/contas/contas";
import { saidaExemplo } from "@/especialistas/produto/teste-fixtures";
import { MODELOS_FALLBACK_CONHECIDOS, MODELO_TEXTO_PADRAO } from "@/ia/config";
import type { ClienteIA, PedidoEstruturado, RespostaEstruturada } from "@/ia";
import { obterDb } from "@/lib/db";

/** Cotação 5; preços do modelo principal e dos fallbacks (US$ 4/20 e 5/25 por milhão). */
export async function configurarOrcamento(teto = "1000") {
  await obterDb().configuracao.upsert({
    where: { id: "global" },
    update: { tetoMensalBrl: teto, cotacaoUsdBrl: "5" },
    create: { id: "global", tetoMensalBrl: teto, cotacaoUsdBrl: "5", cotacaoAtualizadaEm: new Date() },
  });
  for (const [modelo, entrada, saida] of [
    [MODELO_TEXTO_PADRAO, "4", "20"],
    ...MODELOS_FALLBACK_CONHECIDOS.map((m) => [m, "5", "25"]),
  ]) {
    await obterDb().precoModelo.upsert({
      where: { provedor_modelo: { provedor: "anthropic", modelo } },
      update: {},
      create: { provedor: "anthropic", modelo, usdPorMTokEntrada: entrada, usdPorMTokSaida: saida, usdPorMTokCacheLeitura: "0.4", usdPorMTokCacheEscrita: "5" },
    });
  }
}

/** Conta com o briefing mínimo completo para gerar a ficha. */
export async function contaComBriefing(opcoes: { usuario?: string; marcador?: string } = {}) {
  const r = await criarConta({ nome: "Doce Ateliê", usuarioInstagram: opcoes.usuario ?? "doceatelie" });
  if (!r.ok) throw new Error(r.erro);
  const conta = r.valor;
  const produtoId = conta.produtoPrincipalId!;
  const m = opcoes.marcador ?? "";
  await salvarRespostasBriefing({
    contaId: conta.id,
    produtoId,
    marca: { nicho: "CURSO", objetivo90d: "LEADS", tomVoz: ["PROXIMO"], palavrasProibidas: ["fácil"] },
    produto: {
      nome: "Curso Confeitaria que Vende",
      descricao: `Curso online de confeitaria ${m}`,
      preco: "297,00",
      formaCompra: "LINK_CHECKOUT",
      dor: `Gastam com ingredientes e não vendem ${m}`,
      objecaoPrincipal: "Medo de não ter tempo",
      diferencial: "Receitas testadas para vender",
      provas: [{ id: "6f1c2a8e-1111-4222-8333-444455556666", tipo: "NUMERO", conteudo: "1.200 alunas", fonte: "", autorizadoUso: true }],
    },
  });
  await obterDb().isca.create({ data: { produtoId, escolha: "TEM", descricao: "Apostila", formato: "CHECKLIST_PDF", comoRecebe: "LINK_BIO", pronta: true } });
  return { conta, produtoId };
}

export const USO_PADRAO = { tokensEntrada: 3000, tokensSaida: 2000, tokensCacheLeitura: 0, tokensCacheEscrita: 2500 };

/** Cliente de IA falso: responde com a saída de exemplo (ou o que `responder` decidir). */
export function clienteFalso(responder?: (pedido: PedidoEstruturado<unknown>) => Promise<RespostaEstruturada<unknown>>) {
  const pedidos: PedidoEstruturado<unknown>[] = [];
  const cliente: ClienteIA = {
    async gerarEstruturado<T>(pedido: PedidoEstruturado<T>) {
      pedidos.push(pedido as PedidoEstruturado<unknown>);
      if (responder) return (await responder(pedido as PedidoEstruturado<unknown>)) as RespostaEstruturada<T>;
      return {
        dados: saidaExemplo() as T,
        usos: [{ modelo: MODELO_TEXTO_PADRAO, uso: USO_PADRAO }],
        modelo: MODELO_TEXTO_PADRAO,
        fallbackUsado: false,
      };
    },
  };
  return { cliente, pedidos };
}
