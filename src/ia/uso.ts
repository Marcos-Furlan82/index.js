import type { Uso } from "@/custos/calcular";
import type { UsoModelo } from "./tipos";

type UsoBruto = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  iterations?: { type: string; model?: string | null; input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null }[] | null;
};

function paraUso(u: Omit<UsoBruto, "iterations">): Uso {
  return {
    tokensEntrada: u.input_tokens ?? 0,
    tokensSaida: u.output_tokens ?? 0,
    tokensCacheLeitura: u.cache_read_input_tokens ?? 0,
    tokensCacheEscrita: u.cache_creation_input_tokens ?? 0,
  };
}

function somar(a: Uso, b: Uso): Uso {
  return {
    tokensEntrada: (a.tokensEntrada ?? 0) + (b.tokensEntrada ?? 0),
    tokensSaida: (a.tokensSaida ?? 0) + (b.tokensSaida ?? 0),
    tokensCacheLeitura: (a.tokensCacheLeitura ?? 0) + (b.tokensCacheLeitura ?? 0),
    tokensCacheEscrita: (a.tokensCacheEscrita ?? 0) + (b.tokensCacheEscrita ?? 0),
  };
}

/**
 * Uso por modelo. Com fallback, usage.iterations é a fonte da verdade da
 * cobrança (uma entrada por tentativa; o uso de topo cobre só a última).
 * Entradas "message" sem modelo são do modelo pedido.
 */
export function extrairUsos(msg: { model?: string | null; usage?: UsoBruto | null }, modeloPedido: string): UsoModelo[] {
  const usage = msg.usage;
  if (!usage) return [];
  const iteracoes = (usage.iterations ?? []).filter((i) => i.type === "message" || i.type === "fallback_message");
  if (iteracoes.length === 0) return [{ modelo: msg.model || modeloPedido, uso: paraUso(usage) }];
  const porModelo = new Map<string, Uso>();
  for (const i of iteracoes) {
    const modelo = i.model || (i.type === "fallback_message" ? msg.model : null) || modeloPedido;
    porModelo.set(modelo, somar(porModelo.get(modelo) ?? {}, paraUso(i)));
  }
  return [...porModelo].map(([modelo, uso]) => ({ modelo, uso }));
}
