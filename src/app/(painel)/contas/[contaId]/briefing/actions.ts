"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/auth/sessao";
import { registrarEtapa, salvarIsca, salvarRespostasBriefing, type ResultadoSalvamento } from "@/briefing/salvar";
import { buscarContaEditavel } from "@/contas/contas";
import { buscarProdutoDaConta } from "@/contas/produtos";

const INDISPONIVEL: ResultadoSalvamento = { ok: false, erro: "Conta ou produto não encontrado (ou arquivado)." };

/**
 * Autosave do briefing. `mudancas` usa chaves "marca.<campo>" e "produto.<campo>".
 * O produto precisa ser da conta; a conta não pode estar arquivada.
 */
export async function salvarRespostasAcao(pedido: {
  contaId: string;
  produtoId?: string | null;
  etapa?: number | null;
  mudancas: Record<string, unknown>;
}): Promise<ResultadoSalvamento> {
  await exigirSessao();
  const conta = await buscarContaEditavel(pedido?.contaId);
  if (!conta) return INDISPONIVEL;
  const marca: Record<string, unknown> = {};
  const produto: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(pedido.mudancas ?? {})) {
    const [alvo, campo] = chave.split(".");
    if (alvo === "marca" && campo) marca[campo] = valor;
    else if (alvo === "produto" && campo) produto[campo] = valor;
    else return { ok: false, erro: "Resposta inválida." };
  }
  let produtoId: string | null = null;
  if (Object.keys(produto).length > 0) {
    const p = await buscarProdutoDaConta(conta.id, pedido.produtoId);
    if (!p) return INDISPONIVEL;
    produtoId = p.id;
  }
  const r = await salvarRespostasBriefing({
    contaId: conta.id,
    produtoId,
    etapa: typeof pedido.etapa === "number" ? pedido.etapa : null,
    marca,
    produto,
  });
  if (r.ok) revalidatePath(`/contas/${conta.id}`);
  return r;
}

export async function salvarIscaAcao(pedido: { contaId: string; produtoId: string; isca: unknown }): Promise<ResultadoSalvamento> {
  await exigirSessao();
  const conta = await buscarContaEditavel(pedido?.contaId);
  if (!conta) return INDISPONIVEL;
  const produto = await buscarProdutoDaConta(conta.id, pedido.produtoId);
  if (!produto) return INDISPONIVEL;
  return salvarIsca(produto.id, pedido.isca);
}

/** Guarda a etapa para "continuar de onde parou". */
export async function irParaEtapaAcao(contaId: string, etapa: number): Promise<void> {
  await exigirSessao();
  const conta = await buscarContaEditavel(contaId);
  if (!conta || !Number.isInteger(etapa)) return;
  await registrarEtapa(conta.id, etapa);
}
