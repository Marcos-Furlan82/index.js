import { z } from "zod";
import { MAX_TENTATIVAS_FICHA, TIMEOUT_FICHA_MS } from "@/especialistas/produto/config";
import { gerarFichaProduto } from "@/especialistas/produto/gerar";
import { definirJob } from "../tipos";

/** Gera uma versão da ficha do produto com a IA (ver src/especialistas/produto/gerar.ts). */
export const gerarFichaProdutoJob = definirJob({
  schema: z.object({
    produtoId: z.string().uuid(),
    solicitacaoId: z.string().uuid(),
    instrucao: z.string().max(500).optional(),
    baseVersao: z.number().int().positive().optional(),
  }),
  maxTentativas: MAX_TENTATIVAS_FICHA,
  timeoutMs: TIMEOUT_FICHA_MS,
  executar: ({ payload, job, signal }) => gerarFichaProduto(payload, { job, signal }),
});
