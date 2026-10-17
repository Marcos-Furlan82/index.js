import { lerSessao } from "@/auth/sessao";
import { armazenamentoLocalAtivo, lerLocal } from "@/armazenamento/local";

export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

/**
 * Só em desenvolvimento sem R2 (demonstração): serve arquivos de
 * .armazenamento-local/. Em produção sempre 404.
 */
export async function GET(req: Request) {
  if (!armazenamentoLocalAtivo()) return new Response("Não encontrado", { status: 404 });
  if (!(await lerSessao())) return new Response("Não autorizado", { status: 401 });
  const url = new URL(req.url);
  const chave = url.searchParams.get("chave") ?? "";
  const corpo = await lerLocal(chave);
  if (!corpo) return new Response("Não encontrado", { status: 404 });
  const extensao = chave.split(".").pop() ?? "";
  const download = url.searchParams.get("download");
  const headers: Record<string, string> = {
    "content-type": TIPOS[extensao] ?? "application/octet-stream",
    "x-content-type-options": "nosniff",
    "cache-control": "private, max-age=60",
  };
  // SVG original nunca é aberto no navegador: sempre como download.
  if (download || extensao === "svg") {
    headers["content-disposition"] = `attachment; filename="${(download ?? "arquivo.svg").replace(/[^\w.-]+/g, "_")}"`;
  }
  return new Response(new Uint8Array(corpo), { headers });
}
