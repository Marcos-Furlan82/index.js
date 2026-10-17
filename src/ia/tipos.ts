import type { z } from "zod";
import type { Uso } from "@/custos/calcular";

export type Esforco = "low" | "medium" | "high" | "xhigh" | "max";

/** Uso medido de um modelo numa chamada (com fallback, há um item por modelo). */
export type UsoModelo = { modelo: string; uso: Uso };

export type PedidoEstruturado<T> = {
  /** Instruções estáveis (vão para o cache de prompt). */
  sistema: string;
  /** Dados do pedido (variam a cada chamada). */
  mensagem: string;
  esquema: z.ZodType<T>;
  maxTokens: number;
  esforco: Esforco;
  signal?: AbortSignal;
};

export type RespostaEstruturada<T> = {
  dados: T;
  usos: UsoModelo[];
  /** Modelo que produziu a resposta final. */
  modelo: string;
  fallbackUsado: boolean;
};

/** Cliente de IA de texto com saída estruturada. Injetável: testes nunca chamam a API real. */
export interface ClienteIA {
  gerarEstruturado<T>(pedido: PedidoEstruturado<T>): Promise<RespostaEstruturada<T>>;
}
