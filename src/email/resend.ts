import { Resend } from "resend";
import { ErroPermanente } from "@/jobs/erros";
import type { MensagemEmail, OpcoesEnvio, ProvedorEmail } from "./provedor";

type ClienteResend = Pick<Resend, "emails">;

/** Erros que não melhoram tentando de novo (dados ou credencial inválidos). */
const STATUS_PERMANENTES = new Set([400, 401, 403, 404, 422]);

export function criarProvedorResend(
  config: { apiKey: string; remetente: string },
  cliente: ClienteResend = new Resend(config.apiKey),
): ProvedorEmail {
  return {
    nome: "resend",
    async enviar(mensagem: MensagemEmail, opcoes: OpcoesEnvio = {}) {
      const { data, error } = await cliente.emails.send(
        {
          from: config.remetente,
          to: mensagem.para,
          subject: mensagem.assunto,
          html: mensagem.html,
          text: mensagem.texto,
        },
        opcoes.chaveIdempotencia ? { idempotencyKey: opcoes.chaveIdempotencia } : undefined,
      );
      if (error || !data) {
        const texto = `Resend recusou o envio: ${error?.name ?? "sem resposta"} (${error?.statusCode ?? "?"}) ${error?.message ?? ""}`.trim();
        if (error?.statusCode && STATUS_PERMANENTES.has(error.statusCode)) throw new ErroPermanente(texto);
        throw new Error(texto);
      }
      return { id: data.id };
    },
  };
}
