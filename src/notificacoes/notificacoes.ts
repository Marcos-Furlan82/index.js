import { obterDb, type ClienteDb } from "@/lib/db";

/**
 * Avisos no painel (sino no topo). Nunca levam dados do briefing:
 * só títulos e mensagens fixas com o nome do produto/conta.
 */
export type NovaNotificacao = {
  contaId?: string | null;
  tipo: "ficha_pronta" | "ficha_erro" | string;
  titulo: string;
  mensagem: string;
  link?: string | null;
};

export async function notificar(n: NovaNotificacao, db: ClienteDb = obterDb()) {
  return db.notificacao.create({
    data: { contaId: n.contaId ?? null, tipo: n.tipo, titulo: n.titulo, mensagem: n.mensagem, link: n.link ?? null },
  });
}

export async function contarNaoLidas(db: ClienteDb = obterDb()) {
  return db.notificacao.count({ where: { lidaEm: null } });
}

export async function listarNotificacoes(db: ClienteDb = obterDb(), limite = 50) {
  return db.notificacao.findMany({ orderBy: { criadoEm: "desc" }, take: limite, include: { conta: { select: { nome: true } } } });
}

export async function marcarLidas(ids: string[] | "todas", db: ClienteDb = obterDb()) {
  const { count } = await db.notificacao.updateMany({
    where: { lidaEm: null, ...(ids === "todas" ? {} : { id: { in: ids } }) },
    data: { lidaEm: new Date() },
  });
  return count;
}
