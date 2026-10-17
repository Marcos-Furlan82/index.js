import { lerEnv } from "@/lib/env";

/**
 * Configuração da IA de texto. O identificador do modelo existe SÓ aqui
 * (padrão) e no env IA_MODELO_TEXTO; o resto do código lê desta função.
 */
export const PROVEDOR_IA = "anthropic";
export const MODELO_TEXTO_PADRAO = "claude-opus-5-5";

/**
 * Modelos para onde a API pode desviar um pedido recusado com fallbacks "default"
 * (o servidor escolhe pela categoria da recusa). Usados para exigir preço
 * cadastrado e para calcular o máximo da reserva.
 * [CONFERIR] allowed_fallback_models do modelo em /v1/models no primeiro deploy.
 */
export const MODELOS_FALLBACK_CONHECIDOS = ["claude-opus-4-8", "claude-opus-5"] as const;

/** Cabeçalho beta do fallback no servidor com fallbacks: "default". */
export const BETA_FALLBACK_PADRAO = "server-side-fallback-2026-07-01";

export type ConfigIA = {
  apiKey: string | undefined;
  modeloTexto: string;
  /** "default": opt-in no fallback do servidor; "desligado": chave de emergência. */
  fallback: "default" | "desligado";
};

export function configIA(): ConfigIA {
  const env = lerEnv("ia");
  return {
    apiKey: env.ANTHROPIC_API_KEY || undefined,
    modeloTexto: env.IA_MODELO_TEXTO ?? MODELO_TEXTO_PADRAO,
    fallback: env.IA_FALLBACK,
  };
}

/** Modelos que podem ser cobrados numa chamada (principal + fallbacks, se ligados). */
export function modelosCobraveis(config: ConfigIA = configIA()): string[] {
  return config.fallback === "default" ? [config.modeloTexto, ...MODELOS_FALLBACK_CONHECIDOS] : [config.modeloTexto];
}
