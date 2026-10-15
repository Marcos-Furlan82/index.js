export type MensagemEmail = {
  para: string;
  assunto: string;
  html: string;
  texto: string;
};

export type OpcoesEnvio = {
  /** Evita e-mail duplicado quando o job é repetido (o Resend aceita por 24 h). */
  chaveIdempotencia?: string;
};

export interface ProvedorEmail {
  readonly nome: string;
  enviar(mensagem: MensagemEmail, opcoes?: OpcoesEnvio): Promise<{ id: string }>;
}
