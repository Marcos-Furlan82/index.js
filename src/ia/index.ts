import { criarClienteClaude } from "./claude";
import type { ClienteIA } from "./tipos";

let cliente: ClienteIA | undefined;

/** Cliente de IA de texto do processo (Claude). */
export function obterClienteIA(): ClienteIA {
  if (!cliente) cliente = criarClienteClaude();
  return cliente;
}

/** Testes e demonstração: troca o cliente (undefined volta ao real). */
export function definirClienteIA(novo: ClienteIA | undefined) {
  cliente = novo;
}

export type { ClienteIA, PedidoEstruturado, RespostaEstruturada, UsoModelo } from "./tipos";
