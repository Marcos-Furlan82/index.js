import type { PrismaClient, Produto } from "@/generated/prisma/client";
import { obterDb, type ClienteDb } from "@/lib/db";
import type { Resultado } from "./contas";

export function normalizarNomeProduto(texto: string | null | undefined): Resultado<string> {
  const nome = (texto ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return { ok: false, erro: "Informe o nome do produto." };
  if (nome.length > 120) return { ok: false, erro: "Use no máximo 120 caracteres." };
  return { ok: true, valor: nome };
}

/** Produto não arquivado que pertence à conta (protege actions contra ids de outra conta). */
export async function buscarProdutoDaConta(
  contaId: string,
  produtoId: unknown,
  db: ClienteDb = obterDb(),
): Promise<Produto | null> {
  if (typeof produtoId !== "string" || !/^[0-9a-f-]{36}$/i.test(produtoId)) return null;
  const produto = await db.produto.findUnique({ where: { id: produtoId } });
  if (!produto || produto.contaId !== contaId || produto.arquivadoEm) return null;
  return produto;
}

export async function criarProduto(contaId: string, nomeBruto: string, db: ClienteDb = obterDb()): Promise<Resultado<Produto>> {
  const nome = normalizarNomeProduto(nomeBruto);
  if (!nome.ok) return nome;
  const ultimo = await db.produto.aggregate({ where: { contaId }, _max: { ordem: true } });
  const produto = await db.produto.create({ data: { contaId, nome: nome.valor, ordem: (ultimo._max.ordem ?? 0) + 1 } });
  return { ok: true, valor: produto };
}

export async function renomearProduto(produtoId: string, nomeBruto: string, db: ClienteDb = obterDb()): Promise<Resultado<Produto>> {
  const nome = normalizarNomeProduto(nomeBruto);
  if (!nome.ok) return nome;
  return { ok: true, valor: await db.produto.update({ where: { id: produtoId }, data: { nome: nome.valor } }) };
}

/** Troca o produto principal (o ponteiro é único: nunca há dois). */
export async function definirPrincipal(contaId: string, produtoId: string, db: PrismaClient = obterDb()) {
  await db.contaInstagram.update({ where: { id: contaId }, data: { produtoPrincipalId: produtoId } });
}

/** Arquiva um produto secundário. O principal não pode ser arquivado (troque antes). */
export async function arquivarProduto(contaId: string, produtoId: string, db: ClienteDb = obterDb()): Promise<Resultado<null>> {
  const conta = await db.contaInstagram.findUnique({ where: { id: contaId }, select: { produtoPrincipalId: true } });
  if (conta?.produtoPrincipalId === produtoId) {
    return { ok: false, erro: "Este é o produto principal. Escolha outro como principal antes de arquivar." };
  }
  await db.produto.updateMany({ where: { id: produtoId, contaId, arquivadoEm: null }, data: { arquivadoEm: new Date() } });
  return { ok: true, valor: null };
}
