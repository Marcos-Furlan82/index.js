import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  NotFoundError,
  PermissionDeniedError,
  RateLimitError,
  UnprocessableEntityError,
} from "@anthropic-ai/sdk";
import type { UsoModelo } from "./tipos";

export type CodigoErroIA =
  | "recusa"
  | "limite_saida"
  | "saida_invalida"
  | "limite_taxa"
  | "sobrecarga"
  | "servidor"
  | "conexao"
  | "abortado"
  | "requisicao_invalida"
  | "autenticacao"
  | "sem_chave"
  | "desconhecido";

/**
 * Erro da chamada de IA com mensagem FIXA ("ia:<código>"): nunca leva texto do
 * pedido nem da resposta. Carrega:
 * - usos: o que foi medido (para registrar o custo mesmo na falha);
 * - cobrado: se a chamada pode ter sido cobrada (começou a responder);
 * - permanente: se adianta tentar de novo; esperaMs: espera pedida (429).
 */
export class ErroIA extends Error {
  readonly codigo: CodigoErroIA;
  readonly permanente: boolean;
  readonly usos: UsoModelo[];
  readonly cobrado: boolean;
  readonly esperaMs?: number;

  constructor(
    codigo: CodigoErroIA,
    opcoes: { permanente: boolean; usos?: UsoModelo[]; cobrado: boolean; esperaMs?: number },
  ) {
    super(`ia:${codigo}`);
    this.name = "ErroIA";
    this.codigo = codigo;
    this.permanente = opcoes.permanente;
    this.usos = opcoes.usos ?? [];
    this.cobrado = opcoes.cobrado;
    this.esperaMs = opcoes.esperaMs;
  }
}

/** A IA (e os fallbacks) recusaram o pedido. Permanente: repetir dá o mesmo. */
export class ErroRecusaIA extends ErroIA {
  constructor(usos: UsoModelo[]) {
    super("recusa", { permanente: true, usos, cobrado: true });
    this.name = "ErroRecusaIA";
  }
}

/** A resposta passou do limite de tokens de saída (ficaria cortada). */
export class ErroLimiteSaidaIA extends ErroIA {
  constructor(usos: UsoModelo[]) {
    super("limite_saida", { permanente: true, usos, cobrado: true });
    this.name = "ErroLimiteSaidaIA";
  }
}

export const ESPERA_PADRAO_429_MS = 60_000;

/** retry-after em segundos ou data HTTP → ms. */
export function lerRetryAfter(valor: string | null | undefined, agora = Date.now()): number | undefined {
  if (!valor) return undefined;
  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) return Math.ceil(segundos * 1000);
  const data = Date.parse(valor);
  return Number.isNaN(data) ? undefined : Math.max(0, data - agora);
}

/**
 * Converte o erro do SDK numa ErroIA. `iniciado` = a resposta começou a chegar
 * (message_start): nesse caso a chamada pode ter sido cobrada.
 * - 429 → transitório com espera (retry-after ou 60 s), não cobrado;
 * - 529/5xx, conexão e timeout → transitórios;
 * - 400/401/403/404/422 → permanentes (mensagem fixa);
 * - abort (timeout do job) → "abortado".
 */
export function classificarErroIA(erro: unknown, contexto: { usos?: UsoModelo[]; iniciado: boolean }): ErroIA {
  if (erro instanceof ErroIA) return erro;
  const base = { usos: contexto.usos ?? [], cobrado: contexto.iniciado };
  if (erro instanceof APIUserAbortError || (erro instanceof Error && erro.name === "AbortError")) {
    return new ErroIA("abortado", { ...base, permanente: false });
  }
  if (erro instanceof RateLimitError) {
    const espera = lerRetryAfter(erro.headers?.get?.("retry-after")) ?? ESPERA_PADRAO_429_MS;
    return new ErroIA("limite_taxa", { ...base, permanente: false, esperaMs: Math.max(espera, 1_000) });
  }
  if (erro instanceof AuthenticationError || erro instanceof PermissionDeniedError) {
    return new ErroIA("autenticacao", { ...base, permanente: true });
  }
  if (erro instanceof BadRequestError || erro instanceof NotFoundError || erro instanceof UnprocessableEntityError) {
    return new ErroIA("requisicao_invalida", { ...base, permanente: true });
  }
  if (erro instanceof APIConnectionError) {
    return new ErroIA("conexao", { ...base, permanente: false });
  }
  if (erro instanceof APIError) {
    if (erro.status === 529) return new ErroIA("sobrecarga", { ...base, permanente: false });
    if (erro.status === undefined || erro.status >= 500) {
      // Sem status = erro no meio do stream (ex.: overloaded_error).
      return new ErroIA(erro.status === undefined && /overloaded/i.test(erro.message) ? "sobrecarga" : "servidor", {
        ...base,
        permanente: false,
      });
    }
    return new ErroIA("requisicao_invalida", { ...base, permanente: true });
  }
  return new ErroIA("desconhecido", { ...base, permanente: false });
}
