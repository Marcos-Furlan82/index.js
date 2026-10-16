import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { emProducao, lerEnv } from "@/lib/env";

/**
 * Armazenamento local SÓ para desenvolvimento/demonstração sem R2: os arquivos
 * ficam em .armazenamento-local/ e são servidos pela rota /api/dev/arquivo
 * (que responde 404 em produção e exige sessão).
 */
export const PASTA_LOCAL = path.join(process.cwd(), ".armazenamento-local");

export function r2Configurado(): boolean {
  try {
    lerEnv("r2");
    lerEnv("r2Privado");
    return true;
  } catch {
    return false;
  }
}

export function armazenamentoLocalAtivo(): boolean {
  return !emProducao() && !r2Configurado();
}

export function caminhoLocal(chave: string): string | null {
  if (!/^[\w./-]+$/.test(chave) || chave.includes("..")) return null;
  const caminho = path.join(PASTA_LOCAL, chave);
  return caminho.startsWith(PASTA_LOCAL + path.sep) ? caminho : null;
}

export async function gravarLocal(chave: string, corpo: Buffer) {
  const caminho = caminhoLocal(chave);
  if (!caminho) throw new Error("Chave inválida.");
  await mkdir(path.dirname(caminho), { recursive: true });
  await writeFile(caminho, corpo);
}

export async function lerLocal(chave: string): Promise<Buffer | null> {
  const caminho = caminhoLocal(chave);
  if (!caminho) return null;
  try {
    return await readFile(caminho);
  } catch {
    return null;
  }
}

export function urlLocal(chave: string, download?: string): string {
  const q = new URLSearchParams({ chave });
  if (download) q.set("download", download);
  return `/api/dev/arquivo?${q.toString()}`;
}
