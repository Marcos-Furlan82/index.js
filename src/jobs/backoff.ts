/**
 * Espera antes da próxima tentativa: min(30 s · 2^(n-1), 1 h), com ±20% de variação
 * para não sincronizar novas tentativas. n = número da tentativa que falhou (1, 2, ...).
 */
export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 60 * 60 * 1000;
export const BACKOFF_VARIACAO = 0.2;

export function calcularAtrasoMs(tentativa: number, aleatorio: () => number = Math.random): number {
  const n = Math.max(1, tentativa);
  const base = Math.min(BACKOFF_BASE_MS * 2 ** (n - 1), BACKOFF_MAX_MS);
  const fator = 1 + (aleatorio() * 2 - 1) * BACKOFF_VARIACAO;
  return Math.round(base * fator);
}
