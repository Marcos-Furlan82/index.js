import { randomUUID } from "node:crypto";
import type { MensagemEmail, OpcoesEnvio, ProvedorEmail } from "./provedor";

export type EmailEnviado = MensagemEmail & { id: string; chaveIdempotencia?: string };

/** Testes: guarda os e-mails numa lista. */
export const caixaDeSaida: EmailEnviado[] = [];

export function criarProvedorMemoria(): ProvedorEmail {
  return {
    nome: "memoria",
    async enviar(mensagem: MensagemEmail, opcoes: OpcoesEnvio = {}) {
      const id = `memoria-${randomUUID()}`;
      caixaDeSaida.push({ ...mensagem, id, chaveIdempotencia: opcoes.chaveIdempotencia });
      return { id };
    },
  };
}
