/** Parâmetros fixos da geração da ficha do produto (o modelo vem de src/ia/config.ts). */
export const ESPECIALISTA_PRODUTO = "produto";
export const ESFORCO_FICHA = "medium" as const;
export const MAX_TOKENS_FICHA = 16_000;
/**
 * Timeout do job da ficha: 6 min (dentro do máximo de 8 da fila). Com ele, o
 * executor só reivindica um job se sobrarem 7 min da invocação de 15 min.
 */
export const TIMEOUT_FICHA_MS = 6 * 60_000;
/** A reserva de orçamento vale até o job certamente ter terminado. */
export const VALIDADE_RESERVA_FICHA_MS = TIMEOUT_FICHA_MS + 2 * 60_000;
export const MAX_TENTATIVAS_FICHA = 3;
