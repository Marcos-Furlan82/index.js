import { z } from "zod";
import { formatarBRL, formatarDecimalBR } from "@/lib/dinheiro";
import { moldura } from "./html";

export const dadosAlertaOrcamento = z.object({
  mesReferencia: z.string().regex(/^\d{4}-\d{2}$/),
  limiar: z.number().int(),
  percentual: z.string(),
  gastoBrl: z.string(),
  tetoBrl: z.string(),
  escopo: z.string().default("geral"),
});

export function modeloAlertaOrcamento(dados: z.infer<typeof dadosAlertaOrcamento>) {
  const [ano, mes] = dados.mesReferencia.split("-");
  const assunto =
    dados.limiar >= 100
      ? `Orçamento de IA atingido (${mes}/${ano})`
      : `Orçamento de IA: ${dados.limiar}% usado (${mes}/${ano})`;
  const linhas = [
    `O gasto com IA em ${mes}/${ano} chegou a ${formatarBRL(dados.gastoBrl)}, ${formatarDecimalBR(dados.percentual, 2)}% do teto de ${formatarBRL(dados.tetoBrl)}.`,
    dados.limiar >= 100
      ? "A geração de conteúdo novo com IA segue a regra configurada para o teto. As publicações aprovadas continuam."
      : "Nada foi bloqueado. Acompanhe em Configurações → Orçamento.",
  ];
  return { assunto, html: moldura(assunto, linhas), texto: linhas.join("\n") };
}
