import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { z } from "zod";
import { log } from "@/lib/log";
import { BETA_FALLBACK_PADRAO, configIA, type ConfigIA } from "./config";
import { classificarErroIA, ErroIA, ErroLimiteSaidaIA, ErroRecusaIA } from "./erros";
import type { ClienteIA, PedidoEstruturado, RespostaEstruturada } from "./tipos";
import { extrairUsos } from "./uso";

/** Tempo máximo de uma chamada (igual ao timeout do job que a usa; o signal do job manda). */
export const TIMEOUT_CHAMADA_MS = 6 * 60_000;

/** O mínimo do SDK que usamos (injetável nos testes). */
export type AnthropicMinimo = {
  beta: {
    messages: {
      stream(
        params: BetaMessageStreamParams,
        opcoes?: { signal?: AbortSignal | null; timeout?: number },
      ): { finalMessage(): Promise<BetaMessage>; readonly currentMessage?: BetaMessage | undefined };
    };
  };
};

/**
 * JSON Schema para output_config.format: z.toJSONSchema sem "$schema",
 * com "type: [X, null]" trocado por anyOf. Todo objeto já sai com
 * additionalProperties: false. Limites (min/max) ficam só na validação zod.
 */
export function esquemaParaJson(esquema: z.ZodType): Record<string, unknown> {
  const bruto = z.toJSONSchema(esquema) as Record<string, unknown>;
  delete bruto.$schema;
  const ajustar = (no: unknown): unknown => {
    if (Array.isArray(no)) return no.map(ajustar);
    if (!no || typeof no !== "object") return no;
    const saida: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(no)) saida[k] = ajustar(v);
    if (Array.isArray(saida.type) && saida.type.includes("null") && saida.type.length === 2) {
      const outro = (saida.type as string[]).find((t) => t !== "null");
      const { type: _type, enum: lista, ...resto } = saida;
      void _type;
      const opcaoNaoNula: Record<string, unknown> = { ...resto, type: outro };
      if (Array.isArray(lista)) opcaoNaoNula.enum = lista.filter((x) => x !== null);
      return { anyOf: [opcaoNaoNula, { type: "null" }] };
    }
    return saida;
  };
  return ajustar(bruto) as Record<string, unknown>;
}

type BlocoConteudo = { type: string; text?: string };

/**
 * Texto final da resposta estruturada. Ignora blocos que não são texto
 * (thinking, fallback). A) junta todos os textos e valida; B) se falhar e houve
 * troca de modelo (bloco fallback), tenta só os textos depois do último fallback.
 */
export function extrairDados<T>(conteudo: BlocoConteudo[], esquema: z.ZodType<T>): { ok: true; dados: T } | { ok: false } {
  const tentar = (blocos: BlocoConteudo[]) => {
    const texto = blocos
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    if (!texto.trim()) return null;
    try {
      const r = esquema.safeParse(JSON.parse(texto));
      return r.success ? r.data : null;
    } catch {
      return null;
    }
  };
  const todos = tentar(conteudo);
  if (todos !== null) return { ok: true, dados: todos };
  const ultimoFallback = conteudo.map((b) => b.type).lastIndexOf("fallback");
  if (ultimoFallback >= 0) {
    const depois = tentar(conteudo.slice(ultimoFallback + 1));
    if (depois !== null) return { ok: true, dados: depois };
  }
  return { ok: false };
}

export function criarClienteClaude(opcoes: { config?: ConfigIA; anthropic?: AnthropicMinimo } = {}): ClienteIA {
  const config = opcoes.config ?? configIA();
  let anthropic = opcoes.anthropic;

  function sdk(): AnthropicMinimo {
    if (anthropic) return anthropic;
    if (!config.apiKey) throw new ErroIA("sem_chave", { permanente: true, cobrado: false });
    anthropic = new Anthropic({ apiKey: config.apiKey, maxRetries: 1, timeout: TIMEOUT_CHAMADA_MS });
    return anthropic;
  }

  return {
    async gerarEstruturado<T>(pedido: PedidoEstruturado<T>): Promise<RespostaEstruturada<T>> {
      if (pedido.signal?.aborted) throw new ErroIA("abortado", { permanente: false, cobrado: false });
      const modelo = config.modeloTexto;
      const params: BetaMessageStreamParams = {
        model: modelo,
        max_tokens: pedido.maxTokens,
        thinking: { type: "adaptive" },
        output_config: {
          effort: pedido.esforco,
          format: { type: "json_schema", schema: esquemaParaJson(pedido.esquema) },
        },
        // Instruções estáveis primeiro, com cache; os dados variáveis vão na mensagem.
        system: [{ type: "text", text: pedido.sistema, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: pedido.mensagem }],
        ...(config.fallback === "default" ? { betas: [BETA_FALLBACK_PADRAO], fallbacks: "default" as const } : {}),
      };

      let stream: ReturnType<AnthropicMinimo["beta"]["messages"]["stream"]> | undefined;
      let msg: BetaMessage;
      try {
        stream = sdk().beta.messages.stream(params, { signal: pedido.signal, timeout: TIMEOUT_CHAMADA_MS });
        msg = await stream.finalMessage();
      } catch (erro) {
        // Uso parcial do que já chegou (message_start em diante), se houver.
        const parcial = stream?.currentMessage;
        throw classificarErroIA(erro, { usos: parcial ? extrairUsos(parcial, modelo) : [], iniciado: !!parcial });
      }

      const usos = extrairUsos(msg, modelo);
      const fallbackUsado = (msg.usage?.iterations ?? []).some((i) => i.type === "fallback_message");
      if (msg.stop_reason === "refusal") {
        log.warn("ia: pedido recusado", { categoria: msg.stop_details?.category ?? "sem_categoria", fallbackUsado });
        throw new ErroRecusaIA(usos);
      }
      if (msg.stop_reason === "max_tokens") throw new ErroLimiteSaidaIA(usos);
      const r = extrairDados(msg.content as BlocoConteudo[], pedido.esquema);
      if (!r.ok) throw new ErroIA("saida_invalida", { permanente: true, usos, cobrado: true });
      return { dados: r.dados, usos, modelo: msg.model, fallbackUsado };
    },
  };
}
