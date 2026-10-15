/**
 * IP do cliente para o limite de tentativas de login.
 * Em produção só confiamos no header que o Netlify define
 * (x-nf-client-connection-ip); x-forwarded-for pode ser forjado pelo cliente.
 * Sem o header, todos caem no balde "desconhecido" (que também é limitado).
 */
export const IP_DESCONHECIDO = "desconhecido";

export function obterIpCliente(headers: Headers, producao = process.env.NODE_ENV === "production"): string {
  const netlify = headers.get("x-nf-client-connection-ip")?.trim();
  if (netlify) return netlify;
  if (!producao) {
    const encaminhado = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (encaminhado) return encaminhado;
  }
  return IP_DESCONHECIDO;
}
