import { randomUUID } from "node:crypto";
import { log } from "@/lib/log";
import type { MensagemEmail, ProvedorEmail } from "./provedor";

/** Desenvolvimento: só registra destinatário e assunto (nunca o corpo). */
export function criarProvedorConsole(): ProvedorEmail {
  return {
    nome: "console",
    async enviar(mensagem: MensagemEmail) {
      const id = `console-${randomUUID()}`;
      log.info("e-mail (console)", { id, para: mensagem.para, assunto: mensagem.assunto });
      return { id };
    },
  };
}
