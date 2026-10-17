import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ClienteDb } from "@/lib/db";
import { obterDb } from "@/lib/db";
import { emProducao } from "@/lib/env";

/**
 * Sessão opaca: o cookie leva um token aleatório de 32 bytes; o banco guarda
 * só o sha256 dele. Revogar = apagar a linha.
 */

export const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

/** Em produção usa o prefixo __Host- (exige Secure, Path=/ e sem Domain). */
export function nomeCookieSessao(producao = emProducao()): string {
  return producao ? "__Host-sessao" : "sessao";
}

export function opcoesCookieSessao(expiraEm: Date, producao = emProducao()) {
  return {
    httpOnly: true,
    secure: producao,
    sameSite: "lax" as const,
    path: "/",
    expires: expiraEm,
  };
}

export function gerarToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type MetaSessao = { ip?: string | null; userAgent?: string | null };

export async function criarSessaoNoBanco(
  db: ClienteDb,
  usuarioId: string,
  meta: MetaSessao = {},
  agora = new Date(),
) {
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + DURACAO_SESSAO_MS);
  await db.sessao.create({
    data: {
      usuarioId,
      tokenHash: hashToken(token),
      expiraEm,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    },
  });
  return { token, expiraEm };
}

export type SessaoAtiva = {
  sessaoId: string;
  usuario: { id: string; email: string; nome: string };
};

export async function buscarSessaoPorToken(
  db: ClienteDb,
  token: string | undefined | null,
  agora = new Date(),
): Promise<SessaoAtiva | null> {
  if (!token) return null;
  const sessao = await db.sessao.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { usuario: { select: { id: true, email: true, nome: true } } },
  });
  if (!sessao || sessao.expiraEm <= agora) return null;
  return { sessaoId: sessao.id, usuario: sessao.usuario };
}

export async function revogarSessaoPorToken(db: ClienteDb, token: string | undefined | null) {
  if (!token) return;
  await db.sessao.deleteMany({ where: { tokenHash: hashToken(token) } });
}

// ---------------------------------------------------------------------------
// Integração com o Next (cookies da requisição atual)
// ---------------------------------------------------------------------------

export async function gravarCookieSessao(token: string, expiraEm: Date) {
  const jar = await cookies();
  jar.set(nomeCookieSessao(), token, opcoesCookieSessao(expiraEm));
}

export async function lerSessao(): Promise<SessaoAtiva | null> {
  const jar = await cookies();
  return buscarSessaoPorToken(obterDb(), jar.get(nomeCookieSessao())?.value);
}

/**
 * Exigida no layout do painel e no início de TODA server action.
 * Sem sessão válida, redireciona para o login.
 */
export async function exigirSessao(): Promise<SessaoAtiva> {
  const sessao = await lerSessao();
  if (!sessao) redirect("/login");
  return sessao;
}

export async function encerrarSessao() {
  const jar = await cookies();
  const nome = nomeCookieSessao();
  await revogarSessaoPorToken(obterDb(), jar.get(nome)?.value);
  jar.delete(nome);
}
