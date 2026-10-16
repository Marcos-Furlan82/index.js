import {
  APIConnectionError,
  APIError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  RateLimitError,
} from "@anthropic-ai/sdk";
import type { BetaMessage, BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { criarClienteClaude, esquemaParaJson, extrairDados, type AnthropicMinimo } from "./claude";
import type { ConfigIA } from "./config";
import { classificarErroIA, ErroIA, ErroLimiteSaidaIA, ErroRecusaIA, lerRetryAfter } from "./erros";
import { extrairUsos } from "./uso";

const CONFIG: ConfigIA = { apiKey: "chave-falsa", modeloTexto: "modelo-principal", fallback: "default" };
const ESQUEMA = z.object({ titulo: z.string(), itens: z.array(z.object({ nome: z.string(), nota: z.string().nullable() })) });
const DADOS = { titulo: "Ficha", itens: [{ nome: "a", nota: null }] };

function mensagem(parcial: Omit<Partial<BetaMessage>, "content"> & { content: unknown[] }): BetaMessage {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "modelo-principal",
    stop_reason: "end_turn",
    stop_details: null,
    usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 0, cache_creation_input_tokens: 2000, iterations: null },
    ...parcial,
  } as unknown as BetaMessage;
}

function falso(resposta: BetaMessage | (() => Promise<BetaMessage>), parcial?: BetaMessage) {
  const chamadas: { params: BetaMessageStreamParams; opcoes: unknown }[] = [];
  const anthropic: AnthropicMinimo = {
    beta: {
      messages: {
        stream(params, opcoes) {
          chamadas.push({ params, opcoes });
          return {
            finalMessage: typeof resposta === "function" ? resposta : async () => resposta,
            currentMessage: parcial,
          };
        },
      },
    },
  };
  return { anthropic, chamadas };
}

const pedido = (signal?: AbortSignal) => ({
  sistema: "Instruções estáveis",
  mensagem: "<dados>x</dados>",
  esquema: ESQUEMA,
  maxTokens: 16000,
  esforco: "medium" as const,
  signal,
});

const texto = (t: string) => ({ type: "text", text: t });

describe("cliente Claude", () => {
  it("monta o pedido: modelo da configuração, streaming, saída estruturada, cache e fallback", async () => {
    const { anthropic, chamadas } = falso(mensagem({ content: [{ type: "thinking", thinking: "" }, texto(JSON.stringify(DADOS))] }));
    const controle = new AbortController();
    const r = await criarClienteClaude({ config: CONFIG, anthropic }).gerarEstruturado(pedido(controle.signal));
    expect(r).toEqual({
      dados: DADOS,
      modelo: "modelo-principal",
      fallbackUsado: false,
      usos: [{ modelo: "modelo-principal", uso: { tokensEntrada: 1000, tokensSaida: 500, tokensCacheLeitura: 0, tokensCacheEscrita: 2000 } }],
    });
    const { params, opcoes } = chamadas[0];
    expect(params).toMatchObject({
      model: "modelo-principal",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema" } },
      system: [{ type: "text", text: "Instruções estáveis", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "<dados>x</dados>" }],
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    const schema = params.output_config!.format!.schema as Record<string, unknown>;
    expect(schema.$schema).toBeUndefined();
    expect(schema.additionalProperties).toBe(false);
    expect(opcoes).toMatchObject({ signal: controle.signal, timeout: 6 * 60_000 });
  });

  it("com IA_FALLBACK=desligado não manda beta nem fallbacks", async () => {
    const { anthropic, chamadas } = falso(mensagem({ content: [texto(JSON.stringify(DADOS))] }));
    await criarClienteClaude({ config: { ...CONFIG, fallback: "desligado" }, anthropic }).gerarEstruturado(pedido());
    expect(chamadas[0].params).not.toHaveProperty("betas");
    expect(chamadas[0].params).not.toHaveProperty("fallbacks");
  });

  it("recusa, limite de saída e JSON inválido são permanentes e trazem o uso", async () => {
    const casos: [BetaMessage, new (...a: never[]) => ErroIA, string][] = [
      [mensagem({ stop_reason: "refusal", stop_details: { category: "bio" } as never, content: [] }), ErroRecusaIA, "ia:recusa"],
      [mensagem({ stop_reason: "max_tokens", content: [texto('{"titulo":')] }), ErroLimiteSaidaIA, "ia:limite_saida"],
      [mensagem({ content: [texto("isto não é json")] }), ErroIA, "ia:saida_invalida"],
      [mensagem({ content: [texto(JSON.stringify({ titulo: 1 }))] }), ErroIA, "ia:saida_invalida"],
    ];
    for (const [msg, classe, codigo] of casos) {
      const erro = await criarClienteClaude({ config: CONFIG, anthropic: falso(msg).anthropic })
        .gerarEstruturado(pedido())
        .catch((e) => e);
      expect(erro).toBeInstanceOf(classe);
      expect(erro.message).toBe(codigo);
      expect(erro).toMatchObject({ permanente: true, cobrado: true });
      expect(erro.usos[0].uso.tokensEntrada).toBe(1000);
    }
  });

  it("sem chave: erro permanente sem chamar a API", async () => {
    const erro = await criarClienteClaude({ config: { ...CONFIG, apiKey: undefined } }).gerarEstruturado(pedido()).catch((e) => e);
    expect(erro).toMatchObject({ codigo: "sem_chave", permanente: true, cobrado: false });
  });

  it("signal já abortado não chama a API", async () => {
    const { anthropic, chamadas } = falso(mensagem({ content: [] }));
    const c = new AbortController();
    c.abort();
    await expect(criarClienteClaude({ config: CONFIG, anthropic }).gerarEstruturado(pedido(c.signal))).rejects.toMatchObject({ codigo: "abortado" });
    expect(chamadas).toHaveLength(0);
  });

  it("erro antes de começar não é cobrado; erro no meio do stream é, com o uso parcial", async () => {
    const antes = falso(async () => {
      throw new InternalServerError(529, {}, "overloaded", new Headers());
    });
    const e1 = await criarClienteClaude({ config: CONFIG, anthropic: antes.anthropic }).gerarEstruturado(pedido()).catch((e) => e);
    expect(e1).toMatchObject({ codigo: "sobrecarga", permanente: false, cobrado: false, usos: [] });

    const parcial = mensagem({ content: [texto('{"tit')], usage: { input_tokens: 900, output_tokens: 40 } as never });
    const meio = falso(async () => {
      throw new APIError(undefined, { type: "error", error: { type: "overloaded_error" } }, "Overloaded", undefined);
    }, parcial);
    const e2 = await criarClienteClaude({ config: CONFIG, anthropic: meio.anthropic }).gerarEstruturado(pedido()).catch((e) => e);
    expect(e2).toMatchObject({ codigo: "sobrecarga", cobrado: true });
    expect(e2.usos).toEqual([{ modelo: "modelo-principal", uso: { tokensEntrada: 900, tokensSaida: 40, tokensCacheLeitura: 0, tokensCacheEscrita: 0 } }]);
  });
});

describe("fallback no meio da resposta", () => {
  const json = JSON.stringify(DADOS);
  const fb = { type: "fallback", from: { model: "modelo-principal" }, to: { model: "claude-opus-4-8" }, trigger: { type: "refusal", category: "bio" } };

  it("fallback antes da saída: [fallback, texto completo]", () => {
    expect(extrairDados([fb, texto(json)], ESQUEMA)).toEqual({ ok: true, dados: DADOS });
  });

  it("[parcial, fallback, continuação] junta os textos", () => {
    expect(extrairDados([texto(json.slice(0, 10)), fb, texto(json.slice(10))], ESQUEMA)).toEqual({ ok: true, dados: DADOS });
  });

  it("[parcial, fallback, completo] usa só o que veio depois do último fallback", () => {
    expect(extrairDados([texto(json.slice(0, 10)), fb, texto(json)], ESQUEMA)).toEqual({ ok: true, dados: DADOS });
  });

  it("[thinking, texto] ignora o thinking; sem texto válido falha", () => {
    expect(extrairDados([{ type: "thinking" }, texto(json)], ESQUEMA).ok).toBe(true);
    expect(extrairDados([texto("{"), fb, texto("}")], ESQUEMA).ok).toBe(false);
  });

  it("o fallback também recusou → ErroRecusaIA com o uso dos dois modelos", async () => {
    const msg = mensagem({
      stop_reason: "refusal",
      model: "claude-opus-4-8",
      content: [fb],
      usage: {
        input_tokens: 10,
        output_tokens: 0,
        iterations: [
          { type: "message", model: null, input_tokens: 1000, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 1000, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        ],
      } as never,
    });
    const erro = await criarClienteClaude({ config: CONFIG, anthropic: falso(msg).anthropic }).gerarEstruturado(pedido()).catch((e) => e);
    expect(erro).toBeInstanceOf(ErroRecusaIA);
    expect(erro.usos.map((u: { modelo: string }) => u.modelo)).toEqual(["modelo-principal", "claude-opus-4-8"]);
  });
});

describe("extrairUsos", () => {
  it("sem iterações: uso de topo no modelo da resposta, com cache", () => {
    expect(
      extrairUsos({ model: "m", usage: { input_tokens: 5, output_tokens: 6, cache_read_input_tokens: 7, cache_creation_input_tokens: 8 } }, "pedido"),
    ).toEqual([{ modelo: "m", uso: { tokensEntrada: 5, tokensSaida: 6, tokensCacheLeitura: 7, tokensCacheEscrita: 8 } }]);
  });

  it("com fallback: soma por modelo a partir de usage.iterations", () => {
    const usos = extrairUsos(
      {
        model: "fb",
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          iterations: [
            { type: "message", model: null, input_tokens: 100, output_tokens: 10 },
            { type: "compaction", input_tokens: 999, output_tokens: 999 },
            { type: "fallback_message", model: "fb", input_tokens: 200, output_tokens: 300, cache_read_input_tokens: 50 },
          ],
        },
      },
      "principal",
    );
    expect(usos).toEqual([
      { modelo: "principal", uso: { tokensEntrada: 100, tokensSaida: 10, tokensCacheLeitura: 0, tokensCacheEscrita: 0 } },
      { modelo: "fb", uso: { tokensEntrada: 200, tokensSaida: 300, tokensCacheLeitura: 50, tokensCacheEscrita: 0 } },
    ]);
  });
});

describe("classificarErroIA", () => {
  const h = (o: Record<string, string> = {}) => new Headers(o);
  it("429 com retry-after, ou 60 s", () => {
    expect(classificarErroIA(new RateLimitError(429, {}, "rate", h({ "retry-after": "30" })), { iniciado: false })).toMatchObject({
      codigo: "limite_taxa",
      permanente: false,
      cobrado: false,
      esperaMs: 30_000,
    });
    expect(classificarErroIA(new RateLimitError(429, {}, "rate", h()), { iniciado: false }).esperaMs).toBe(60_000);
    expect(lerRetryAfter("abc")).toBeUndefined();
  });

  it("transitórios e permanentes", () => {
    expect(classificarErroIA(new InternalServerError(500, {}, "x", h()), { iniciado: false })).toMatchObject({ codigo: "servidor", permanente: false });
    expect(classificarErroIA(new APIConnectionError({ message: "x" }), { iniciado: true })).toMatchObject({ codigo: "conexao", cobrado: true });
    expect(classificarErroIA(new BadRequestError(400, {}, "segredo do pedido", h()), { iniciado: false })).toMatchObject({
      codigo: "requisicao_invalida",
      permanente: true,
      message: "ia:requisicao_invalida",
    });
    expect(classificarErroIA(new AuthenticationError(401, {}, "x", h()), { iniciado: false }).codigo).toBe("autenticacao");
    expect(classificarErroIA(new APIUserAbortError(), { iniciado: true })).toMatchObject({ codigo: "abortado", cobrado: true });
    expect(classificarErroIA(new Error("qualquer"), { iniciado: false }).codigo).toBe("desconhecido");
  });
});

describe("esquemaParaJson", () => {
  it("sem $schema, sem limites, nullable vira anyOf e todo objeto fecha propriedades", () => {
    const s = esquemaParaJson(ESQUEMA);
    const texto = JSON.stringify(s);
    expect(texto).not.toContain("$schema");
    expect(texto).toContain('"anyOf":[{"type":"string"},{"type":"null"}]');
    const visitar = (no: unknown): void => {
      if (Array.isArray(no)) return no.forEach(visitar);
      if (!no || typeof no !== "object") return;
      const o = no as Record<string, unknown>;
      if (o.type === "object") expect(o.additionalProperties).toBe(false);
      Object.values(o).forEach(visitar);
    };
    visitar(s);
  });
});

