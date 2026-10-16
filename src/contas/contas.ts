import type { ContaInstagram, PrismaClient } from "@/generated/prisma/client";
import { obterDb, type ClienteDb } from "@/lib/db";

export const NOME_PRODUTO_PROVISORIO = "Produto principal";
const USUARIO_VALIDO = /^[a-z0-9._]{1,30}$/;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/** "@Doce.Atelie " → "doce.atelie". Vazio → null (o @ é opcional no cadastro). */
export function normalizarUsuarioInstagram(texto: string | null | undefined): Resultado<string | null> {
  const limpo = (texto ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (!limpo) return { ok: true, valor: null };
  if (!USUARIO_VALIDO.test(limpo)) {
    return { ok: false, erro: "Use só letras, números, ponto e sublinhado (até 30 caracteres), sem espaços." };
  }
  return { ok: true, valor: limpo };
}

export function normalizarNomeConta(texto: string | null | undefined): Resultado<string> {
  const nome = (texto ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return { ok: false, erro: "Informe o nome da conta." };
  if (nome.length > 80) return { ok: false, erro: "Use no máximo 80 caracteres." };
  return { ok: true, valor: nome };
}

async function usuarioEmUso(db: ClienteDb, usuario: string, excetoId?: string) {
  const outra = await db.contaInstagram.findFirst({
    where: { usuarioInstagram: usuario, arquivadaEm: null, ...(excetoId ? { id: { not: excetoId } } : {}) },
    select: { id: true },
  });
  return !!outra;
}

async function travarUsuario(tx: ClienteDb, usuario: string) {
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`usuario:${usuario}`}, 0))) AS trava`;
}

/**
 * Cria a conta com a marca e um produto principal provisório, numa transação.
 * O @ é único entre as contas não arquivadas.
 */
export async function criarConta(
  dados: { nome: string; usuarioInstagram?: string | null },
  db: PrismaClient = obterDb(),
): Promise<Resultado<ContaInstagram>> {
  const nome = normalizarNomeConta(dados.nome);
  if (!nome.ok) return nome;
  const usuario = normalizarUsuarioInstagram(dados.usuarioInstagram);
  if (!usuario.ok) return usuario;
  return db.$transaction(async (tx) => {
    if (usuario.valor) {
      await travarUsuario(tx, usuario.valor);
      if (await usuarioEmUso(tx, usuario.valor)) {
        return { ok: false as const, erro: `Já existe uma conta com @${usuario.valor}.` };
      }
    }
    const conta = await tx.contaInstagram.create({
      data: { nome: nome.valor, usuarioInstagram: usuario.valor, marca: { create: {} } },
    });
    const produto = await tx.produto.create({
      data: { contaId: conta.id, nome: NOME_PRODUTO_PROVISORIO, ordem: 0 },
    });
    const final = await tx.contaInstagram.update({ where: { id: conta.id }, data: { produtoPrincipalId: produto.id } });
    return { ok: true as const, valor: final };
  });
}

export async function editarConta(
  contaId: string,
  dados: { nome: string; usuarioInstagram?: string | null },
  db: PrismaClient = obterDb(),
): Promise<Resultado<ContaInstagram>> {
  const nome = normalizarNomeConta(dados.nome);
  if (!nome.ok) return nome;
  const usuario = normalizarUsuarioInstagram(dados.usuarioInstagram);
  if (!usuario.ok) return usuario;
  return db.$transaction(async (tx) => {
    if (usuario.valor) {
      await travarUsuario(tx, usuario.valor);
      if (await usuarioEmUso(tx, usuario.valor, contaId)) {
        return { ok: false as const, erro: `Já existe uma conta com @${usuario.valor}.` };
      }
    }
    const conta = await tx.contaInstagram.update({
      where: { id: contaId },
      data: { nome: nome.valor, usuarioInstagram: usuario.valor },
    });
    return { ok: true as const, valor: conta };
  });
}

/** Arquivar em vez de apagar: sai do seletor e vira só leitura. */
export async function arquivarConta(contaId: string, db: ClienteDb = obterDb()) {
  const { count } = await db.contaInstagram.updateMany({
    where: { id: contaId, arquivadaEm: null },
    data: { arquivadaEm: new Date() },
  });
  return count > 0;
}

/** Conta existente e não arquivada (toda action que altera dados passa por aqui). */
export async function buscarContaEditavel(contaId: unknown, db: ClienteDb = obterDb()) {
  if (typeof contaId !== "string" || !/^[0-9a-f-]{36}$/i.test(contaId)) return null;
  const conta = await db.contaInstagram.findUnique({ where: { id: contaId } });
  if (!conta || conta.arquivadaEm) return null;
  return conta;
}

/** Garante a linha da marca (contas criadas antes da fase 1 não têm). */
export async function obterMarca(contaId: string, db: ClienteDb = obterDb()) {
  return db.marca.upsert({ where: { contaId }, update: {}, create: { contaId } });
}

export type ResumoConta = Awaited<ReturnType<typeof listarContas>>[number];

/** Lista com o progresso de cada conta (etapa do briefing e status da ficha principal). */
export async function listarContas(opcoes: { arquivadas?: boolean } = {}, db: ClienteDb = obterDb()) {
  const contas = await db.contaInstagram.findMany({
    where: { arquivadaEm: opcoes.arquivadas ? { not: null } : null },
    orderBy: { nome: "asc" },
    include: {
      marca: { select: { etapaAtual: true, briefingIniciadoEm: true, referenciasConcluidasEm: true } },
      produtoPrincipal: {
        select: {
          id: true,
          nome: true,
          fichas: { orderBy: { versao: "desc" }, take: 1, select: { status: true, versao: true } },
        },
      },
      _count: { select: { produtos: { where: { arquivadoEm: null } } } },
    },
  });
  return contas.map((c) => ({
    id: c.id,
    nome: c.nome,
    usuarioInstagram: c.usuarioInstagram,
    arquivadaEm: c.arquivadaEm,
    etapaAtual: c.marca?.etapaAtual ?? 1,
    briefingIniciado: !!c.marca?.briefingIniciadoEm,
    referenciasConcluidas: !!c.marca?.referenciasConcluidasEm,
    produtoPrincipal: c.produtoPrincipal
      ? { id: c.produtoPrincipal.id, nome: c.produtoPrincipal.nome, ficha: c.produtoPrincipal.fichas[0] ?? null }
      : null,
    produtos: c._count.produtos,
  }));
}
