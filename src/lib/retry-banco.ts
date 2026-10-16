/**
 * Códigos do Prisma que indicam falha passageira do banco (conexão, timeout,
 * conflito de transação). Vale a pena repetir a operação.
 */
export const CODIGOS_BANCO_TRANSITORIOS = ["P1001", "P1002", "P1008", "P1017", "P2034"] as const;

export const ESPERAS_RETRY_BANCO_MS = [200, 1_000, 3_000] as const;

/** Código do erro do Prisma (known request ou initialization), se houver. */
export function codigoPrisma(erro: unknown): string | undefined {
  if (!erro || typeof erro !== "object") return undefined;
  const e = erro as { code?: unknown; errorCode?: unknown; name?: unknown };
  if (typeof e.name !== "string" || !e.name.startsWith("PrismaClient")) return undefined;
  if (typeof e.code === "string") return e.code;
  if (typeof e.errorCode === "string") return e.errorCode;
  return undefined;
}

export function erroDeBancoTransitorio(erro: unknown): boolean {
  const codigo = codigoPrisma(erro);
  return !!codigo && (CODIGOS_BANCO_TRANSITORIOS as readonly string[]).includes(codigo);
}

/**
 * Executa `fn` e, se falhar com erro transitório do banco, repete até 3 vezes
 * (200 ms, 1 s, 3 s). Usado onde repetir o job inteiro sairia caro
 * (ex.: gravar o resultado de uma chamada de IA já paga).
 */
export async function comRetryDeBanco<T>(
  fn: () => Promise<T>,
  esperas: readonly number[] = ESPERAS_RETRY_BANCO_MS,
  dormir: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  for (let tentativa = 0; ; tentativa++) {
    try {
      return await fn();
    } catch (erro) {
      if (!erroDeBancoTransitorio(erro) || tentativa >= esperas.length) throw erro;
      await dormir(esperas[tentativa]);
    }
  }
}
