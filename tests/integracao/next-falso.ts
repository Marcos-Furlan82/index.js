import { vi } from "vitest";

/**
 * Substitui next/headers por um "jar" de cookies e headers em memória,
 * para chamar server actions e exigirSessao() fora de uma requisição real.
 */
export const requisicaoFalsa = {
  cookies: new Map<string, string>(),
  headers: new Headers(),
  limpar() {
    this.cookies.clear();
    this.headers = new Headers();
  },
};

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nome: string) => {
      const value = requisicaoFalsa.cookies.get(nome);
      return value === undefined ? undefined : { name: nome, value };
    },
    set: (nome: string, valor: string) => {
      requisicaoFalsa.cookies.set(nome, valor);
    },
    delete: (nome: string) => {
      requisicaoFalsa.cookies.delete(nome);
    },
  }),
  headers: async () => requisicaoFalsa.headers,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

/** Executa e devolve o destino do redirect() do Next (ou null se não redirecionou). */
export async function destinoDoRedirect(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (erro) {
    const digest = (erro as { digest?: string }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      return digest.split(";")[2] ?? "";
    }
    throw erro;
  }
}
