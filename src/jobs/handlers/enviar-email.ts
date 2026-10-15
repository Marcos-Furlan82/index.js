import { z } from "zod";
import { obterProvedorEmail } from "@/email";
import { MODELOS, montarEmail, type NomeModelo } from "@/email/modelos";
import { definirJob } from "../tipos";

const nomesModelos = Object.keys(MODELOS) as [NomeModelo, ...NomeModelo[]];

const schema = z
  .object({
    para: z.string().email(),
    assunto: z.string().max(200).optional(),
    modelo: z.enum(nomesModelos),
    dados: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((v, ctx) => {
    const r = MODELOS[v.modelo].dados.safeParse(v.dados);
    if (!r.success) ctx.addIssue({ code: "custom", path: ["dados"], message: r.error.message });
  });

/** Todo e-mail sai por este job (ganha novas tentativas de graça). */
export const enviarEmail = definirJob({
  schema,
  maxTentativas: 5,
  timeoutMs: 30_000,
  async executar({ payload, job }) {
    const montado = montarEmail(payload.modelo, payload.dados);
    const { id } = await obterProvedorEmail().enviar(
      { para: payload.para, assunto: payload.assunto ?? montado.assunto, html: montado.html, texto: montado.texto },
      { chaveIdempotencia: `job-${job.id}` },
    );
    return { emailId: id };
  },
});
