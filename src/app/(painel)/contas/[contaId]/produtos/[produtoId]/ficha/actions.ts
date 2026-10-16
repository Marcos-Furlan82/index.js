"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/auth/sessao";
import type { EstadoFormulario } from "@/componentes/formulario-acao";
import { buscarContaEditavel } from "@/contas/contas";
import { buscarProdutoDaConta } from "@/contas/produtos";
import {
  aprovarFicha,
  dispensarPendencia,
  editarBlocoFicha,
  marcarBlocoRevisado,
  MAX_INSTRUCAO,
  solicitarGeracaoFicha,
  tentarDeNovoFicha,
} from "@/especialistas/produto/fichas";

const INDISPONIVEL = "Conta ou produto não encontrado (ou arquivado).";

async function alvo(contaId: unknown, produtoId: unknown) {
  const conta = await buscarContaEditavel(contaId);
  if (!conta) return null;
  const produto = await buscarProdutoDaConta(conta.id, produtoId);
  return produto ? { conta, produto } : null;
}

const caminho = (contaId: string, produtoId: string) => `/contas/${contaId}/produtos/${produtoId}/ficha`;
const texto = (f: FormData, c: string) => (typeof f.get(c) === "string" ? (f.get(c) as string) : "");

export async function gerarFichaAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const a = await alvo(formData.get("contaId"), formData.get("produtoId"));
  if (!a) return { erro: INDISPONIVEL };
  const instrucao = texto(formData, "instrucao").trim();
  if (instrucao.length > MAX_INSTRUCAO) return { erro: `Use no máximo ${MAX_INSTRUCAO} caracteres.` };
  const base = Number(texto(formData, "baseVersao"));
  const r = await solicitarGeracaoFicha(a.conta.id, a.produto.id, {
    instrucao: instrucao || null,
    baseVersao: Number.isInteger(base) && base > 0 ? base : null,
  });
  revalidatePath(caminho(a.conta.id, a.produto.id));
  return r.ok
    ? { ok: "Montando sua ficha… pode levar alguns instantes. Você pode sair desta tela, avisamos quando ficar pronta." }
    : { erro: r.erro };
}

export async function tentarDeNovoFichaAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const a = await alvo(formData.get("contaId"), formData.get("produtoId"));
  if (!a) return { erro: INDISPONIVEL };
  const ok = await tentarDeNovoFicha(a.conta.id, a.produto.id);
  revalidatePath(caminho(a.conta.id, a.produto.id));
  return ok ? { ok: "Tentando de novo…" } : { erro: "Não há geração com erro para repetir." };
}

export async function marcarRevisadoAcao(dados: { contaId: string; produtoId: string; fichaId: string; bloco: string; revisado: boolean }) {
  await exigirSessao();
  const a = await alvo(dados?.contaId, dados?.produtoId);
  if (!a) return { ok: false as const, erro: INDISPONIVEL };
  const r = await marcarBlocoRevisado(a.conta.id, a.produto.id, String(dados.fichaId), String(dados.bloco), !!dados.revisado);
  revalidatePath(caminho(a.conta.id, a.produto.id));
  return r;
}

export async function editarBlocoAcao(dados: { contaId: string; produtoId: string; fichaId: string; bloco: string; valor: unknown }) {
  await exigirSessao();
  const a = await alvo(dados?.contaId, dados?.produtoId);
  if (!a) return { ok: false as const, erro: INDISPONIVEL };
  const r = await editarBlocoFicha(a.conta.id, a.produto.id, String(dados.fichaId), String(dados.bloco), dados.valor);
  revalidatePath(caminho(a.conta.id, a.produto.id));
  return r;
}

export async function dispensarPendenciaAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const a = await alvo(formData.get("contaId"), formData.get("produtoId"));
  if (!a) return { erro: INDISPONIVEL };
  const r = await dispensarPendencia(a.conta.id, a.produto.id, texto(formData, "fichaId"), texto(formData, "chave"));
  revalidatePath(caminho(a.conta.id, a.produto.id));
  return r.ok ? { ok: "Sugestão dispensada." } : { erro: r.erro };
}

export async function aprovarFichaAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const sessao = await exigirSessao();
  const a = await alvo(formData.get("contaId"), formData.get("produtoId"));
  if (!a) return { erro: INDISPONIVEL };
  const r = await aprovarFicha(a.conta.id, a.produto.id, texto(formData, "fichaId"), sessao.usuario.email);
  revalidatePath(caminho(a.conta.id, a.produto.id));
  revalidatePath(`/contas/${a.conta.id}`);
  if (!r.ok) return { erro: "motivos" in r ? `${r.erro} ${r.motivos.join(" ")}` : r.erro };
  return { ok: "Ficha aprovada. Você pode editá-la quando quiser." };
}
