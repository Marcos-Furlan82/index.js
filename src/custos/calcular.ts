import { dec, Decimal, type ValorDecimal } from "@/lib/dinheiro";

/** Uso medido de uma chamada de IA. */
export type Uso = {
  tokensEntrada?: number;
  tokensSaida?: number;
  tokensCacheLeitura?: number;
  tokensCacheEscrita?: number;
  imagens?: number;
  segundosVideo?: ValorDecimal;
};

/** Preços em dólar (por milhão de tokens, por imagem, por segundo de vídeo). */
export type Precos = {
  usdPorMTokEntrada?: ValorDecimal | null;
  usdPorMTokSaida?: ValorDecimal | null;
  usdPorMTokCacheLeitura?: ValorDecimal | null;
  usdPorMTokCacheEscrita?: ValorDecimal | null;
  usdPorImagem?: ValorDecimal | null;
  usdPorSegundoVideo?: ValorDecimal | null;
};

export type ResultadoCusto =
  | { ok: true; custoUsd: Decimal; custoBrl: Decimal }
  | { ok: false; faltando: string[] };

const MILHAO = new Decimal(1_000_000);

const COMPONENTES: { uso: keyof Uso; preco: keyof Precos; porMilhao: boolean }[] = [
  { uso: "tokensEntrada", preco: "usdPorMTokEntrada", porMilhao: true },
  { uso: "tokensSaida", preco: "usdPorMTokSaida", porMilhao: true },
  { uso: "tokensCacheLeitura", preco: "usdPorMTokCacheLeitura", porMilhao: true },
  { uso: "tokensCacheEscrita", preco: "usdPorMTokCacheEscrita", porMilhao: true },
  { uso: "imagens", preco: "usdPorImagem", porMilhao: false },
  { uso: "segundosVideo", preco: "usdPorSegundoVideo", porMilhao: false },
];

/**
 * Custo = Σ uso × preço (tokens por milhão), em USD; BRL = USD × cotação.
 * Sem arredondar: os valores são guardados com muitas casas.
 * Se algum item usado não tem preço (ou falta a cotação), devolve o que falta.
 */
export function calcularCusto(
  uso: Uso,
  precos: Precos | null | undefined,
  cotacaoUsdBrl: ValorDecimal | null | undefined,
): ResultadoCusto {
  const faltando: string[] = [];
  let usd = new Decimal(0);
  for (const c of COMPONENTES) {
    const quantidade = dec(uso[c.uso] ?? 0);
    if (quantidade.isZero()) continue;
    const preco = precos?.[c.preco];
    if (preco === null || preco === undefined) {
      faltando.push(c.preco);
      continue;
    }
    const parcela = quantidade.mul(dec(preco));
    usd = usd.add(c.porMilhao ? parcela.div(MILHAO) : parcela);
  }
  if (cotacaoUsdBrl === null || cotacaoUsdBrl === undefined) faltando.push("cotacaoUsdBrl");
  if (faltando.length > 0) return { ok: false, faltando };
  return { ok: true, custoUsd: usd, custoBrl: usd.mul(dec(cotacaoUsdBrl)) };
}
