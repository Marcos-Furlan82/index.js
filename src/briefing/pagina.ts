import { notFound } from "next/navigation";
import { obterDb } from "@/lib/db";
import { lerBriefingMarca, lerBriefingProduto } from "./esquemas";
import { faltandoParaGerar, type ContextoBriefing } from "./obrigatorios";
import { iscaParaFormulario } from "./salvar";

const UUID = /^[0-9a-f-]{36}$/i;

/** Dados de uma página do briefing (conta + produto), ou 404. */
export async function carregarPaginaBriefing(contaId: string, produtoId?: string) {
  if (!UUID.test(contaId) || (produtoId !== undefined && !UUID.test(produtoId))) notFound();
  const conta = await obterDb().contaInstagram.findUnique({ where: { id: contaId }, include: { marca: true } });
  if (!conta) notFound();
  const id = produtoId ?? conta.produtoPrincipalId;
  const produto = id ? await obterDb().produto.findUnique({ where: { id }, include: { isca: true } }) : null;
  if (!produto || produto.contaId !== conta.id) notFound();
  const marca = lerBriefingMarca(conta.marca?.briefing);
  const briefingProduto = lerBriefingProduto(produto.briefing);
  const isca = iscaParaFormulario(produto.isca);
  const ctx: ContextoBriefing = {
    contaId: conta.id,
    produto: { id: produto.id, nome: produto.nome, briefing: briefingProduto },
    principal: conta.produtoPrincipalId === produto.id,
    marca,
    isca,
  };
  return {
    conta,
    produto,
    marca,
    briefingProduto,
    isca,
    principal: ctx.principal,
    faltando: faltandoParaGerar(ctx),
    somenteLeitura: !!conta.arquivadaEm || !!produto.arquivadoEm,
  };
}
