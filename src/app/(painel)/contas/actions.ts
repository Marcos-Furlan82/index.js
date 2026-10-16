"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirSessao } from "@/auth/sessao";
import type { EstadoFormulario } from "@/componentes/formulario-acao";
import { gravarContaAtiva } from "@/contas/conta-ativa";
import { arquivarConta, buscarContaEditavel, criarConta, editarConta } from "@/contas/contas";
import { arquivarProduto, buscarProdutoDaConta, criarProduto, definirPrincipal, renomearProduto } from "@/contas/produtos";

function texto(formData: FormData, campo: string): string {
  const v = formData.get(campo);
  return typeof v === "string" ? v : "";
}

const CONTA_INDISPONIVEL = "Conta não encontrada ou arquivada.";

export async function criarContaAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const r = await criarConta({ nome: texto(formData, "nome"), usuarioInstagram: texto(formData, "usuarioInstagram") });
  if (!r.ok) return { erro: r.erro };
  await gravarContaAtiva(r.valor.id);
  revalidatePath("/contas");
  redirect(`/contas/${r.valor.id}/briefing?etapa=1`);
}

export async function editarContaAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const conta = await buscarContaEditavel(formData.get("contaId"));
  if (!conta) return { erro: CONTA_INDISPONIVEL };
  const r = await editarConta(conta.id, {
    nome: texto(formData, "nome"),
    usuarioInstagram: texto(formData, "usuarioInstagram"),
  });
  if (!r.ok) return { erro: r.erro };
  revalidatePath(`/contas/${conta.id}`);
  revalidatePath("/contas");
  return { ok: "Dados da conta salvos." };
}

export async function arquivarContaAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const conta = await buscarContaEditavel(formData.get("contaId"));
  if (!conta) return { erro: CONTA_INDISPONIVEL };
  if (formData.get("confirmo") !== "sim") return { erro: "Marque a confirmação para arquivar." };
  await arquivarConta(conta.id);
  revalidatePath("/contas");
  redirect("/contas");
}

/** Seletor do topo: define a conta padrão da navegação e abre a conta. */
export async function trocarContaAtiva(formData: FormData) {
  await exigirSessao();
  const conta = await buscarContaEditavel(formData.get("contaId"));
  if (!conta) redirect("/contas");
  await gravarContaAtiva(conta.id);
  redirect(`/contas/${conta.id}`);
}

export async function criarProdutoAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const conta = await buscarContaEditavel(formData.get("contaId"));
  if (!conta) return { erro: CONTA_INDISPONIVEL };
  const r = await criarProduto(conta.id, texto(formData, "nome"));
  if (!r.ok) return { erro: r.erro };
  revalidatePath(`/contas/${conta.id}`);
  return { ok: `Produto ${r.valor.nome} criado.` };
}

export async function renomearProdutoAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const conta = await buscarContaEditavel(formData.get("contaId"));
  if (!conta) return { erro: CONTA_INDISPONIVEL };
  const produto = await buscarProdutoDaConta(conta.id, formData.get("produtoId"));
  if (!produto) return { erro: "Produto não encontrado." };
  const r = await renomearProduto(produto.id, texto(formData, "nome"));
  if (!r.ok) return { erro: r.erro };
  revalidatePath(`/contas/${conta.id}`);
  return { ok: "Nome salvo." };
}

export async function definirPrincipalAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const conta = await buscarContaEditavel(formData.get("contaId"));
  if (!conta) return { erro: CONTA_INDISPONIVEL };
  const produto = await buscarProdutoDaConta(conta.id, formData.get("produtoId"));
  if (!produto) return { erro: "Produto não encontrado." };
  await definirPrincipal(conta.id, produto.id);
  revalidatePath(`/contas/${conta.id}`);
  return { ok: `${produto.nome} agora é o produto principal.` };
}

export async function arquivarProdutoAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const conta = await buscarContaEditavel(formData.get("contaId"));
  if (!conta) return { erro: CONTA_INDISPONIVEL };
  const produto = await buscarProdutoDaConta(conta.id, formData.get("produtoId"));
  if (!produto) return { erro: "Produto não encontrado." };
  const r = await arquivarProduto(conta.id, produto.id);
  if (!r.ok) return { erro: r.erro };
  revalidatePath(`/contas/${conta.id}`);
  return { ok: "Produto arquivado." };
}
