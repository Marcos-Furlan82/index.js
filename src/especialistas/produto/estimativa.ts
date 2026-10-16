import type { PrecoModelo } from "@/generated/prisma/client";
import { dec, Decimal, type ValorDecimal } from "@/lib/dinheiro";

/**
 * Custo MÁXIMO de uma geração (sem chamar a API; vale para a reserva e para a
 * tela "no máximo R$ X"). Conservador de propósito:
 * - tokens de entrada ≈ caracteres / 2,5 (sistema + mensagem + esquema);
 * - o sistema pode ser cobrado como escrita de cache;
 * - saída: 2 × max_tokens (a tentativa recusada também pode ser cobrada);
 * - sempre o MAIOR preço entre o modelo principal e os de fallback.
 */
export const CARACTERES_POR_TOKEN = 2.5;
const MILHAO = new Decimal(1_000_000);

export function estimarTokens(texto: string): number {
  return Math.ceil(texto.length / CARACTERES_POR_TOKEN);
}

export type ResultadoEstimativa =
  | { ok: true; maximoUsd: Decimal; maximoBrl: Decimal; tokensEntrada: number }
  | { ok: false; motivo: "sem_preco"; faltando: string[] }
  | { ok: false; motivo: "sem_cotacao" };

export function estimarMaximo(entrada: {
  sistema: string;
  mensagem: string;
  esquemaJson: string;
  maxTokens: number;
  modelos: string[];
  precos: Pick<PrecoModelo, "modelo" | "usdPorMTokEntrada" | "usdPorMTokSaida" | "usdPorMTokCacheEscrita">[];
  cotacaoUsdBrl: ValorDecimal | null;
}): ResultadoEstimativa {
  const faltando = entrada.modelos.filter((m) => {
    const p = entrada.precos.find((x) => x.modelo === m);
    return !p || p.usdPorMTokEntrada === null || p.usdPorMTokSaida === null;
  });
  if (faltando.length > 0) return { ok: false, motivo: "sem_preco", faltando };
  if (entrada.cotacaoUsdBrl === null || entrada.cotacaoUsdBrl === undefined) return { ok: false, motivo: "sem_cotacao" };

  const precos = entrada.modelos.map((m) => entrada.precos.find((x) => x.modelo === m)!);
  const maior = (f: (p: (typeof precos)[number]) => Decimal) => precos.map(f).reduce((a, b) => (b.gt(a) ? b : a), dec(0));
  const precoEntrada = maior((p) => dec(p.usdPorMTokEntrada));
  const precoSaida = maior((p) => dec(p.usdPorMTokSaida));
  // Sem preço de escrita de cache cadastrado: 1,25 × entrada (regra do cache de 5 min).
  const precoCache = maior((p) => (p.usdPorMTokCacheEscrita !== null ? dec(p.usdPorMTokCacheEscrita) : dec(p.usdPorMTokEntrada).mul("1.25")));

  const tokensEntrada = estimarTokens(entrada.sistema) + estimarTokens(entrada.mensagem) + estimarTokens(entrada.esquemaJson);
  const tokensSistema = estimarTokens(entrada.sistema);
  const usd = dec(tokensEntrada)
    .mul(precoEntrada)
    .add(dec(tokensSistema).mul(precoCache))
    .add(dec(2 * entrada.maxTokens).mul(precoSaida))
    .div(MILHAO);
  return { ok: true, maximoUsd: usd, maximoBrl: usd.mul(dec(entrada.cotacaoUsdBrl)), tokensEntrada };
}
