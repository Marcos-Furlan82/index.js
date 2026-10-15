"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/auth/sessao";
import { confirmarUpload, solicitarUpload } from "@/armazenamento/midias";
import { enfileirarJob, reenfileirarJob } from "@/jobs/fila";

export type EstadoAcao = { ok?: string; erro?: string };

const CAMINHO = "/configuracoes/sistema";

export async function enfileirarPing(): Promise<EstadoAcao> {
  await exigirSessao();
  await enfileirarJob({ tipo: "ping", payload: { origem: "painel" } });
  revalidatePath(CAMINHO);
  return { ok: "Ping enfileirado. Ele deve rodar na próxima passagem do agendador (até ~2 min)." };
}

const esquemaReenvio = z.object({ jobId: z.string().uuid() });

export async function tentarDeNovo(_anterior: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  await exigirSessao();
  const dados = esquemaReenvio.safeParse({ jobId: formData.get("jobId") });
  if (!dados.success) return { erro: "Job inválido." };
  const ok = await reenfileirarJob(dados.data.jobId);
  revalidatePath(CAMINHO);
  return ok ? { ok: "Job enfileirado de novo." } : { erro: "Só jobs com falha ou cancelados podem ser reenviados." };
}

export async function solicitarUploadTeste(dados: {
  tipoMime: string;
  tamanhoBytes: number;
  nomeOriginal: string;
}) {
  await exigirSessao();
  // A tela Sistema só testa imagens; vídeos entram com a biblioteca de mídia.
  if (!dados.tipoMime?.startsWith("image/")) {
    return { ok: false as const, erro: "Nesta tela, envie só imagens (JPEG, PNG ou WebP)." };
  }
  return solicitarUpload({ ...dados, contaId: null });
}

export async function confirmarUploadTeste(midiaId: string) {
  await exigirSessao();
  if (!z.string().uuid().safeParse(midiaId).success) return { ok: false as const, erro: "Upload inválido." };
  const resultado = await confirmarUpload(midiaId);
  revalidatePath(CAMINHO);
  return resultado;
}
