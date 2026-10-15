import type { ClienteDb } from "@/lib/db";
import { criarSessaoNoBanco, type MetaSessao } from "./sessao";
import { verificarSenha, verificarSenhaFicticia } from "./senha";

/**
 * Limites de tentativa:
 * - Por IP: bloqueio rígido após 10 falhas em 15 minutos.
 * - Por e-mail: só atraso progressivo, min(2^(falhas-3), 8) s a partir da 4ª
 *   tentativa (não dá para um atacante trancar o gestor fora). O atraso não
 *   dorme dentro da action: calcula pelo horário da última falha e responde
 *   "aguarde N s" sem verificar a senha.
 * Emergência: `pnpm gestor:criar --redefinir`.
 */

export const JANELA_MS = 15 * 60 * 1000;
export const MAX_FALHAS_IP = 10;
export const MSG_CREDENCIAIS = "E-mail ou senha incorretos.";
export const MSG_BLOQUEADO = "Muitas tentativas. Tente de novo em alguns minutos.";

export function atrasoPorFalhas(falhas: number): number {
  if (falhas < 3) return 0;
  return Math.min(2 ** (falhas - 3), 8);
}

export type ResultadoLogin =
  | { ok: true; usuarioId: string; token: string; expiraEm: Date }
  | { ok: false; erro: string; aguardarSegundos?: number };

export function normalizarEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function autenticar(
  db: ClienteDb,
  dados: { email: string; senha: string; ip: string } & MetaSessao,
  agora = new Date(),
): Promise<ResultadoLogin> {
  const email = normalizarEmail(dados.email);
  const desde = new Date(agora.getTime() - JANELA_MS);

  const falhasIp = await db.tentativaLogin.count({
    where: { ip: dados.ip, sucesso: false, criadoEm: { gt: desde } },
  });
  if (falhasIp >= MAX_FALHAS_IP) return { ok: false, erro: MSG_BLOQUEADO };

  // Falhas do e-mail na janela, contando só depois do último sucesso.
  const ultimoSucesso = await db.tentativaLogin.findFirst({
    where: { email, sucesso: true, criadoEm: { gt: desde } },
    orderBy: { criadoEm: "desc" },
    select: { criadoEm: true },
  });
  const inicioContagem = ultimoSucesso?.criadoEm ?? desde;
  const falhasEmail = await db.tentativaLogin.findMany({
    where: { email, sucesso: false, criadoEm: { gt: inicioContagem } },
    orderBy: { criadoEm: "desc" },
    select: { criadoEm: true },
  });
  const atraso = atrasoPorFalhas(falhasEmail.length);
  if (atraso > 0) {
    const liberaEm = falhasEmail[0].criadoEm.getTime() + atraso * 1000;
    if (liberaEm > agora.getTime()) {
      const aguardarSegundos = Math.ceil((liberaEm - agora.getTime()) / 1000);
      return {
        ok: false,
        erro: `Aguarde ${aguardarSegundos} s antes de tentar de novo.`,
        aguardarSegundos,
      };
    }
  }

  const usuario = await db.usuario.findUnique({ where: { email } });
  const senhaOk = usuario
    ? await verificarSenha(dados.senha, usuario.senhaHash)
    : await verificarSenhaFicticia(dados.senha);

  await db.tentativaLogin.create({
    data: { email, ip: dados.ip, sucesso: senhaOk, criadoEm: agora },
  });

  if (!usuario || !senhaOk) return { ok: false, erro: MSG_CREDENCIAIS };

  const { token, expiraEm } = await criarSessaoNoBanco(
    db,
    usuario.id,
    { ip: dados.ip, userAgent: dados.userAgent },
    agora,
  );
  return { ok: true, usuarioId: usuario.id, token, expiraEm };
}
