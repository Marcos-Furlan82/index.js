import { z } from "zod";
import { moldura } from "./html";

export const dadosTeste = z.object({ solicitadoPor: z.string().max(200).optional() });

export function modeloTeste(dados: z.infer<typeof dadosTeste>) {
  const assunto = "E-mail de teste do Planejador de Instagram";
  const linhas = [
    "Se você recebeu esta mensagem, o envio de e-mails está funcionando.",
    ...(dados.solicitadoPor ? [`Teste solicitado por ${dados.solicitadoPor}.`] : []),
  ];
  return { assunto, html: moldura(assunto, linhas), texto: linhas.join("\n") };
}
