"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/auth/sessao";
import {
  concluirReferencias,
  confirmarUploadReferencia,
  removerReferencia,
  salvarMetadadosReferencia,
  solicitarUploadReferencia,
} from "@/armazenamento/referencias";
import type { EstadoFormulario } from "@/componentes/formulario-acao";
import { buscarContaEditavel } from "@/contas/contas";

const INDISPONIVEL = { ok: false as const, erro: "Conta não encontrada ou arquivada." };
const caminho = (contaId: string) => `/contas/${contaId}/briefing`;

export async function solicitarUploadReferenciaAcao(dados: {
  contaId: string;
  categoria: string;
  tipoMime: string;
  tamanhoBytes: number;
  nomeOriginal: string;
  licencaFonte?: boolean;
}) {
  await exigirSessao();
  const conta = await buscarContaEditavel(dados?.contaId);
  if (!conta) return INDISPONIVEL;
  return solicitarUploadReferencia({ ...dados, contaId: conta.id });
}

export async function confirmarUploadReferenciaAcao(contaId: string, midiaId: string) {
  await exigirSessao();
  const conta = await buscarContaEditavel(contaId);
  if (!conta) return INDISPONIVEL;
  if (typeof midiaId !== "string" || !/^[0-9a-f-]{36}$/i.test(midiaId)) return { ok: false as const, erro: "Envio inválido." };
  const r = await confirmarUploadReferencia(conta.id, midiaId);
  revalidatePath(caminho(conta.id));
  return r;
}

export async function salvarMetadadosAcao(contaId: string, referenciaId: string, dados: unknown) {
  await exigirSessao();
  const conta = await buscarContaEditavel(contaId);
  if (!conta) return INDISPONIVEL;
  const r = await salvarMetadadosReferencia(conta.id, String(referenciaId), dados);
  if (r.ok) revalidatePath(caminho(conta.id));
  return r.ok ? { ok: true as const, salvoEm: new Date().toISOString() } : r;
}

export async function removerReferenciaAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const conta = await buscarContaEditavel(formData.get("contaId"));
  if (!conta) return { erro: INDISPONIVEL.erro };
  const ok = await removerReferencia(conta.id, String(formData.get("referenciaId")));
  revalidatePath(caminho(conta.id));
  return ok ? { ok: "Removida." } : { erro: "Referência não encontrada." };
}

export async function concluirReferenciasAcao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const conta = await buscarContaEditavel(formData.get("contaId"));
  if (!conta) return { erro: INDISPONIVEL.erro };
  const r = await concluirReferencias(conta.id);
  if (!r.ok) return { erro: r.erro };
  revalidatePath(caminho(conta.id));
  revalidatePath(`/contas/${conta.id}`);
  return {
    ok: `Referências guardadas (versão ${r.versao}).${r.avisos.length > 0 ? ` Atenção: ${r.avisos.join(" ")}` : ""}`,
  };
}
