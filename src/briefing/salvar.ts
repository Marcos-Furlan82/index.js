import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { obterDb, type ClienteDb } from "@/lib/db";
import { normalizarNomeProduto } from "@/contas/produtos";
import {
  esquemaIsca,
  esquemaRascunhoMarca,
  esquemaRascunhoProduto,
  lerBriefingMarca,
  lerBriefingProduto,
  type DadosIsca,
} from "./esquemas";
import type { ContextoBriefing } from "./obrigatorios";
import { buscarSugestao } from "./sugestoes-isca";
import { urlHttp } from "@/lib/url";

export type ResultadoSalvamento = { ok: true; salvoEm: string } | { ok: false; erro: string };

function primeiroErro(erro: { issues: { path: PropertyKey[]; message: string }[] }) {
  const i = erro.issues[0];
  return i ? i.message : "Resposta inválida.";
}

/**
 * Autosave do briefing. Valida o rascunho e grava com merge raso atômico no
 * banco (briefing = briefing || novo): salvamentos simultâneos de campos
 * diferentes não se perdem. Listas e objetos vão sempre inteiros.
 */
export async function salvarRespostasBriefing(
  pedido: {
    contaId: string;
    produtoId?: string | null;
    etapa?: number | null;
    marca?: Record<string, unknown> | null;
    produto?: Record<string, unknown> | null;
  },
  db: PrismaClient = obterDb(),
): Promise<ResultadoSalvamento> {
  const marca = pedido.marca && Object.keys(pedido.marca).length > 0 ? esquemaRascunhoMarca.safeParse(pedido.marca) : null;
  if (marca && !marca.success) return { ok: false, erro: primeiroErro(marca.error) };

  const { nome, ...restoProduto } = pedido.produto ?? {};
  let nomeProduto: string | undefined;
  if (nome !== undefined) {
    const r = normalizarNomeProduto(typeof nome === "string" ? nome : "");
    if (!r.ok) return { ok: false, erro: r.erro };
    nomeProduto = r.valor;
  }
  const produto = Object.keys(restoProduto).length > 0 ? esquemaRascunhoProduto.safeParse(restoProduto) : null;
  if (produto && !produto.success) return { ok: false, erro: primeiroErro(produto.error) };
  if ((produto || nomeProduto !== undefined) && !pedido.produtoId) return { ok: false, erro: "Produto não informado." };

  const etapa = pedido.etapa && pedido.etapa >= 1 && pedido.etapa <= 5 ? pedido.etapa : null;
  const agora = new Date();
  await db.$transaction(async (tx) => {
    await tx.marca.upsert({ where: { contaId: pedido.contaId }, update: {}, create: { contaId: pedido.contaId } });
    const json = JSON.stringify(marca?.success ? marca.data : {});
    await tx.$executeRaw`
      UPDATE "Marca"
         SET "briefing" = "briefing" || ${json}::jsonb,
             "briefingIniciadoEm" = COALESCE("briefingIniciadoEm", ${agora}),
             "etapaAtual" = COALESCE(${etapa}::int, "etapaAtual"),
             "atualizadoEm" = ${agora}
       WHERE "contaId" = ${pedido.contaId}`;
    if (pedido.produtoId && (produto?.success || nomeProduto !== undefined)) {
      const jsonProduto = JSON.stringify(produto?.success ? produto.data : {});
      await tx.$executeRaw`
        UPDATE "Produto"
           SET "briefing" = "briefing" || ${jsonProduto}::jsonb,
               "nome" = COALESCE(${nomeProduto ?? null}::text, "nome"),
               "atualizadoEm" = ${agora}
         WHERE "id" = ${pedido.produtoId} AND "contaId" = ${pedido.contaId}`;
    }
  });
  return { ok: true, salvoEm: agora.toISOString() };
}

/** Só registra a etapa (navegação entre etapas, para retomar de onde parou). */
export async function registrarEtapa(contaId: string, etapa: number, db: ClienteDb = obterDb()) {
  if (!(etapa >= 1 && etapa <= 5)) return;
  await db.marca.upsert({
    where: { contaId },
    update: { etapaAtual: etapa, briefingIniciadoEm: undefined },
    create: { contaId, etapaAtual: etapa, briefingIniciadoEm: new Date() },
  });
}

/**
 * Isca do produto (pergunta 9), três caminhos:
 * - TEM: descrição, formato, como recebe, link opcional, pronta/previsão;
 * - SUGESTAO: ideia do nicho escolhida; entra como "ainda não pronta";
 * - SEM_ISCA: sem isca neste ciclo.
 */
export async function salvarIsca(
  produtoId: string,
  entrada: unknown,
  db: ClienteDb = obterDb(),
): Promise<ResultadoSalvamento> {
  const r = esquemaIsca.safeParse(entrada);
  if (!r.success) return { ok: false, erro: primeiroErro(r.error) };
  const d = r.data;
  let dados: Omit<Prisma.IscaUncheckedCreateInput, "produtoId">;
  if (d.escolha === "SEM_ISCA") {
    dados = { escolha: "SEM_ISCA", descricao: null, formato: null, comoRecebe: null, link: null, pronta: false, previsaoPronta: null, sugestaoChave: null };
  } else if (d.escolha === "SUGESTAO") {
    const sugestao = buscarSugestao(d.sugestaoChave);
    if (d.sugestaoChave && !sugestao) return { ok: false, erro: "Sugestão inválida." };
    dados = {
      escolha: "SUGESTAO",
      sugestaoChave: sugestao?.chave ?? null,
      descricao: sugestao?.titulo ?? null,
      formato: sugestao?.formato ?? null,
      comoRecebe: d.comoRecebe ?? "LINK_BIO",
      link: urlHttp(d.link),
      pronta: false,
      previsaoPronta: d.previsaoPronta ? new Date(`${d.previsaoPronta}T00:00:00Z`) : null,
    };
  } else {
    dados = {
      escolha: "TEM",
      sugestaoChave: null,
      descricao: d.descricao ?? null,
      formato: d.formato ?? null,
      comoRecebe: d.comoRecebe ?? null,
      link: urlHttp(d.link),
      pronta: d.pronta,
      previsaoPronta: !d.pronta && d.previsaoPronta ? new Date(`${d.previsaoPronta}T00:00:00Z`) : null,
    };
  }
  await db.isca.upsert({ where: { produtoId }, update: dados, create: { produtoId, ...dados } });
  return { ok: true, salvoEm: new Date().toISOString() };
}

export function iscaParaFormulario(isca: {
  escolha: DadosIsca["escolha"];
  descricao: string | null;
  formato: DadosIsca["formato"] | null;
  comoRecebe: DadosIsca["comoRecebe"] | null;
  link: string | null;
  pronta: boolean;
  previsaoPronta: Date | null;
  sugestaoChave: string | null;
} | null): DadosIsca | null {
  if (!isca) return null;
  return {
    escolha: isca.escolha,
    descricao: isca.descricao,
    formato: isca.formato,
    comoRecebe: isca.comoRecebe,
    link: isca.link,
    pronta: isca.pronta,
    previsaoPronta: isca.previsaoPronta ? isca.previsaoPronta.toISOString().slice(0, 10) : null,
    sugestaoChave: isca.sugestaoChave,
  };
}

/** Carrega tudo o que as regras do briefing precisam sobre um produto. */
export async function carregarContextoBriefing(contaId: string, produtoId: string, db: ClienteDb = obterDb()) {
  const conta = await db.contaInstagram.findUnique({
    where: { id: contaId },
    include: { marca: true },
  });
  const produto = await db.produto.findUnique({ where: { id: produtoId }, include: { isca: true } });
  if (!conta || !produto || produto.contaId !== contaId) return null;
  const ctx: ContextoBriefing = {
    contaId,
    produto: { id: produto.id, nome: produto.nome, briefing: lerBriefingProduto(produto.briefing) },
    principal: conta.produtoPrincipalId === produto.id,
    marca: lerBriefingMarca(conta.marca?.briefing),
    isca: iscaParaFormulario(produto.isca),
  };
  return { ctx, conta, produto };
}
