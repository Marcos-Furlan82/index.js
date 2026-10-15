/**
 * Log estruturado (JSON numa linha) com redação de segredos.
 * Regra: chave normalizada (minúscula, sem "_" e "-") igual a, ou terminando com,
 * um dos termos sensíveis é redigida. URLs pré-assinadas perdem a query string.
 */

const TERMOS_SENSIVEIS = [
  "token",
  "secret",
  "senha",
  "password",
  "senhahash",
  "apikey",
  "authorization",
  "cookie",
  "signature",
  "xsegredojobs",
];

export const REDIGIDO = "[redigido]";

export function chaveSensivel(chave: string): boolean {
  const normalizada = chave.toLowerCase().replace(/[_-]/g, "");
  return TERMOS_SENSIVEIS.some((t) => normalizada === t || normalizada.endsWith(t));
}

const URL_ASSINADA = /(https?:\/\/[^\s"'?]+)\?[^\s"']*(X-Amz-|x-amz-)[^\s"']*/g;

export function redigirTexto(texto: string): string {
  return texto.replace(URL_ASSINADA, `$1?${REDIGIDO}`);
}

export function redigir(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 8) return "[profundo demais]";
  if (typeof valor === "string") return redigirTexto(valor);
  if (typeof valor === "bigint") return valor.toString();
  if (valor instanceof Error) {
    return { nome: valor.name, mensagem: redigirTexto(valor.message) };
  }
  if (valor instanceof Date) return valor.toISOString();
  if (Array.isArray(valor)) return valor.map((v) => redigir(v, profundidade + 1));
  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const [chave, v] of Object.entries(valor)) {
      saida[chave] = chaveSensivel(chave) ? REDIGIDO : redigir(v, profundidade + 1);
    }
    return saida;
  }
  return valor;
}

type Nivel = "debug" | "info" | "warn" | "error";

function escrever(nivel: Nivel, mensagem: string, dados?: Record<string, unknown>) {
  if (process.env.LOG_SILENCIOSO === "1" && nivel !== "error") return;
  const linha = JSON.stringify({
    nivel,
    msg: redigirTexto(mensagem),
    em: new Date().toISOString(),
    ...(dados ? (redigir(dados) as Record<string, unknown>) : {}),
  });
  if (nivel === "error") console.error(linha);
  else if (nivel === "warn") console.warn(linha);
  else console.log(linha);
}

export const log = {
  debug: (msg: string, dados?: Record<string, unknown>) => escrever("debug", msg, dados),
  info: (msg: string, dados?: Record<string, unknown>) => escrever("info", msg, dados),
  warn: (msg: string, dados?: Record<string, unknown>) => escrever("warn", msg, dados),
  error: (msg: string, dados?: Record<string, unknown>) => escrever("error", msg, dados),
};
