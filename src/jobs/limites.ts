/**
 * Limites de tempo da fila. A relação entre eles é coberta por teste.
 * - Uma Background Function do Netlify roda no máximo 15 min.
 * - Cada tipo de job tem timeout (padrão 2 min, máximo 8 min).
 * - Antes de cada reivindicação, o executor exige tempo restante
 *   >= maior timeout do registro + 1 min de margem.
 * - Um job EXECUTANDO há mais de 20 min (15 + 5) é considerado travado.
 */
export const LIMITE_INVOCACAO_MS = 15 * 60 * 1000;
export const TIMEOUT_PADRAO_MS = 2 * 60 * 1000;
export const TIMEOUT_MAXIMO_MS = 8 * 60 * 1000;
export const MARGEM_CLAIM_MS = 60 * 1000;
export const PRAZO_RECUPERACAO_MS = LIMITE_INVOCACAO_MS + 5 * 60 * 1000;
export const MAX_TENTATIVAS_PADRAO = 5;
export const TAMANHO_MAX_ERRO = 2048;
