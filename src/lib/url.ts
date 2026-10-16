/**
 * Só aceita links http(s). Qualquer outro esquema (javascript:, data:, file:...)
 * vira null: nunca é usado como href. Devolve a URL normalizada.
 */
export function urlHttp(texto: string | null | undefined): string | null {
  const limpo = (texto ?? "").trim();
  if (!limpo || limpo.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(limpo);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/** Atributos para links externos vindos de dados do usuário ou da IA. */
export const ATRIBUTOS_LINK_EXTERNO = { target: "_blank", rel: "noopener noreferrer" } as const;
