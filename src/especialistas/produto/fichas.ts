import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { faltandoParaGerar, type Faltante } from "@/briefing/obrigatorios";
import { carregarContextoBriefing } from "@/briefing/salvar";
import { podeGastar, type DecisaoGasto } from "@/custos/orcamento";
import { enfileirarJob, reenfileirarJob } from "@/jobs/fila";
import { obterDb } from "@/lib/db";
import { formatarBRL } from "@/lib/dinheiro";
import {
  BLOCOS_FICHA,
  CHAVES_BLOCO,
  esquemaEdicaoBloco,
  esquemaFicha,
  type CampoFicha,
  type ChaveBloco,
  type Ficha,
} from "./esquema";
import type { ResultadoEstimativa } from "./estimativa";
import { lerFicha, prepararGeracao } from "./gerar";
import { bloqueiosAprovacao, chavePendencia, contextoRegras, recalcularPendencias } from "./regras";

export const MAX_INSTRUCAO = 500;

export type ResultadoSolicitacaoFicha =
  | { ok: true; jobId: string }
  | { ok: false; erro: string; faltando?: Faltante[]; irPara?: "orcamento" | "briefing" };

/** Texto para a tela quando a estimativa ou o orçamento não deixam gerar. */
export function mensagemBloqueioOrcamento(
  estimativa: ResultadoEstimativa,
  decisao: DecisaoGasto | null,
): { erro: string; irPara: "orcamento" } | null {
  if (!estimativa.ok) {
    if (estimativa.motivo === "sem_preco") {
      return { erro: `Cadastre o preço de: ${estimativa.faltando.join(", ")} em Orçamento.`, irPara: "orcamento" };
    }
    return { erro: "Defina o teto mensal de gastos com IA antes de gerar.", irPara: "orcamento" };
  }
  if (!decisao || decisao.permitido) return null;
  if (decisao.motivo === "orcamento_nao_configurado") {
    return { erro: "Defina o teto mensal de gastos com IA antes de gerar.", irPara: "orcamento" };
  }
  if (decisao.motivo === "teto_conta") {
    return {
      erro: "A cota de IA desta conta acabou neste mês. Aumente a cota ou espere o dia 1º. O que já foi aprovado continua publicando.",
      irPara: "orcamento",
    };
  }
  return {
    erro: `O orçamento de IA deste mês acabou (${formatarBRL(decisao.comprometidoGeralBrl)} de ${formatarBRL(decisao.tetoGeralBrl)}). Aumente o teto ou espere o dia 1º. O que já foi aprovado continua publicando.`,
    irPara: "orcamento",
  };
}

/**
 * Pede uma nova versão da ficha (primeira ou "Gerar outra versão").
 * Numa transação com o produto travado (FOR UPDATE): recusa se já há geração
 * em andamento; senão enfileira com chave nova (ficha:<produto>:<solicitação>)
 * e guarda o job no produto.
 */
export async function solicitarGeracaoFicha(
  contaId: string,
  produtoId: string,
  extra: { instrucao?: string | null; baseVersao?: number | null } = {},
  db: PrismaClient = obterDb(),
): Promise<ResultadoSolicitacaoFicha> {
  const instrucao = extra.instrucao?.trim() ? extra.instrucao.trim().slice(0, MAX_INSTRUCAO) : undefined;
  const prep = await prepararGeracao(produtoId, { instrucao, baseVersao: extra.baseVersao }, db);
  if (!prep || prep.conta.id !== contaId) return { ok: false, erro: "Produto não encontrado." };
  const faltando = faltandoParaGerar(prep.ctx);
  if (faltando.length > 0) {
    return { ok: false, erro: "Ainda faltam algumas respostas para gerar a ficha.", faltando, irPara: "briefing" };
  }
  const decisao = prep.estimativa.ok ? await podeGastar(contaId, prep.estimativa.maximoBrl, db) : null;
  const bloqueio = mensagemBloqueioOrcamento(prep.estimativa, decisao);
  if (bloqueio) return { ok: false, ...bloqueio };

  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Produto" WHERE "id" = ${produtoId} FOR UPDATE`;
    const produto = await tx.produto.findUniqueOrThrow({ where: { id: produtoId } });
    if (produto.geracaoJobId) {
      const atual = await tx.job.findUnique({ where: { id: produto.geracaoJobId }, select: { status: true } });
      if (atual && (atual.status === "PENDENTE" || atual.status === "EXECUTANDO")) {
        return { ok: false as const, erro: "Já estamos montando esta ficha. Assim que ficar pronta, avisamos." };
      }
    }
    const solicitacaoId = randomUUID();
    const job = await enfileirarJob(
      {
        tipo: "gerar-ficha-produto",
        payload: { produtoId, solicitacaoId, ...(instrucao ? { instrucao } : {}), ...(extra.baseVersao ? { baseVersao: extra.baseVersao } : {}) },
        contaId,
        chaveIdempotencia: `ficha:${produtoId}:${solicitacaoId}`,
      },
      tx,
    );
    await tx.produto.update({ where: { id: produtoId }, data: { geracaoJobId: job.id } });
    return { ok: true as const, jobId: job.id };
  });
}

/** "Tentar de novo": reabre o mesmo job que falhou (mesmo pedido). */
export async function tentarDeNovoFicha(contaId: string, produtoId: string, db: PrismaClient = obterDb()) {
  const produto = await db.produto.findUnique({ where: { id: produtoId } });
  if (!produto || produto.contaId !== contaId || !produto.geracaoJobId) return false;
  return reenfileirarJob(produto.geracaoJobId, db);
}

export type EstadoGeracao =
  | { fase: "nenhuma" }
  | { fase: "gerando"; desde: Date }
  | { fase: "erro"; codigo: string; jobId: string }
  | { fase: "concluida" };

export async function estadoGeracao(geracaoJobId: string | null, db: PrismaClient = obterDb()): Promise<EstadoGeracao> {
  if (!geracaoJobId) return { fase: "nenhuma" };
  const job = await db.job.findUnique({ where: { id: geracaoJobId } });
  if (!job) return { fase: "nenhuma" };
  if (job.status === "PENDENTE" || job.status === "EXECUTANDO") return { fase: "gerando", desde: job.criadoEm };
  if (job.status === "FALHOU" || job.status === "CANCELADO") {
    // Job.erro é "Nome: codigo" (mensagem fixa); só o código interessa à tela.
    const codigo = (job.erro ?? "").replace(/^[A-Za-z]+: /, "");
    return { fase: "erro", codigo, jobId: job.id };
  }
  return { fase: "concluida" };
}

// ---------------------------------------------------------------------------
// Revisão, edição e aprovação
// ---------------------------------------------------------------------------

export type ResultadoFicha = { ok: true; versao: number } | { ok: false; erro: string };

const VERSAO_DESATUALIZADA = "Existe uma versão mais nova desta ficha. Recarregue a página.";

async function travarFicha(tx: ClienteDbTx, produtoId: string) {
  await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`ficha:${produtoId}`}, 0))) AS trava`;
}

type ClienteDbTx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/** Ficha do produto da conta, e se é a versão mais recente. */
async function buscarFichaDaConta(tx: ClienteDbTx, contaId: string, produtoId: string, fichaId: string) {
  const ficha = await tx.fichaProduto.findUnique({ where: { id: fichaId } });
  if (!ficha || ficha.contaId !== contaId || ficha.produtoId !== produtoId) return null;
  const ultima = await tx.fichaProduto.aggregate({ where: { produtoId }, _max: { versao: true } });
  return { ficha, maisRecente: ficha.versao === ultima._max.versao };
}

export async function marcarBlocoRevisado(
  contaId: string,
  produtoId: string,
  fichaId: string,
  bloco: string,
  revisado: boolean,
  db: PrismaClient = obterDb(),
): Promise<ResultadoFicha> {
  if (!(CHAVES_BLOCO as string[]).includes(bloco)) return { ok: false, erro: "Bloco inválido." };
  return db.$transaction(async (tx) => {
    await travarFicha(tx, produtoId);
    const achada = await buscarFichaDaConta(tx, contaId, produtoId, fichaId);
    if (!achada) return { ok: false as const, erro: "Ficha não encontrada." };
    if (!achada.maisRecente) return { ok: false as const, erro: VERSAO_DESATUALIZADA };
    if (achada.ficha.status !== "RASCUNHO") return { ok: false as const, erro: "Esta versão já foi aprovada. Edite um bloco para criar uma nova." };
    const atuais = new Set(achada.ficha.blocosRevisados);
    if (revisado) atuais.add(bloco);
    else atuais.delete(bloco);
    await tx.fichaProduto.update({ where: { id: fichaId }, data: { blocosRevisados: [...atuais] } });
    return { ok: true as const, versao: achada.ficha.versao };
  });
}

/**
 * Edição manual de um bloco: cria uma NOVA versão (origem EDICAO) a partir da
 * mais recente. Os campos do bloco viram "informado", o bloco fica revisado,
 * as pendências da IA desse bloco saem e as de regra são recalculadas.
 */
export async function editarBlocoFicha(
  contaId: string,
  produtoId: string,
  fichaId: string,
  bloco: string,
  valor: unknown,
  db: PrismaClient = obterDb(),
): Promise<ResultadoFicha> {
  if (!(CHAVES_BLOCO as string[]).includes(bloco) || bloco === "provas") return { ok: false, erro: "Este bloco não pode ser editado aqui." };
  const chave = bloco as ChaveBloco;
  const validado = esquemaEdicaoBloco[chave].safeParse(valor);
  if (!validado.success) return { ok: false, erro: validado.error.issues[0]?.message ?? "Dados inválidos." };
  const carregado = await carregarContextoBriefing(contaId, produtoId, db);
  if (!carregado) return { ok: false, erro: "Produto não encontrado." };
  const rc = contextoRegras(carregado.ctx);
  const campos = BLOCOS_FICHA.find((b) => b.chave === chave)!.campos as readonly CampoFicha[];

  return db.$transaction(async (tx) => {
    await travarFicha(tx, produtoId);
    const achada = await buscarFichaDaConta(tx, contaId, produtoId, fichaId);
    if (!achada) return { ok: false as const, erro: "Ficha não encontrada." };
    if (!achada.maisRecente) return { ok: false as const, erro: VERSAO_DESATUALIZADA };
    const atual = lerFicha(achada.ficha.conteudo);
    if (!atual) return { ok: false as const, erro: "Não foi possível ler esta ficha." };
    const novo: Ficha = recalcularPendencias(
      {
        ...atual,
        ...(validado.data as Partial<Ficha>),
        confianca: [
          ...atual.confianca.filter((c) => !campos.includes(c.campo)),
          ...campos.map((campo) => ({ campo, nivel: "informado" as const })),
        ],
        pendencias: atual.pendencias.filter((p) => !(p.origem === "ia" && campos.includes(p.campo))),
      },
      rc,
    );
    const criada = await tx.fichaProduto.create({
      data: {
        produtoId,
        contaId,
        versao: achada.ficha.versao + 1,
        status: "RASCUNHO",
        origem: "EDICAO",
        conteudo: esquemaFicha.parse(novo),
        baseVersao: achada.ficha.versao,
        blocosRevisados: [...new Set([...achada.ficha.blocosRevisados, chave])],
        pendenciasDispensadas: achada.ficha.pendenciasDispensadas,
      },
    });
    return { ok: true as const, versao: criada.versao };
  });
}

/** "Dispensar" uma pendência de melhora (nunca as que bloqueiam). */
export async function dispensarPendencia(
  contaId: string,
  produtoId: string,
  fichaId: string,
  chavePendenciaAlvo: string,
  db: PrismaClient = obterDb(),
): Promise<ResultadoFicha> {
  return db.$transaction(async (tx) => {
    await travarFicha(tx, produtoId);
    const achada = await buscarFichaDaConta(tx, contaId, produtoId, fichaId);
    if (!achada) return { ok: false as const, erro: "Ficha não encontrada." };
    const ficha = lerFicha(achada.ficha.conteudo);
    const pendencia = ficha?.pendencias.find((p) => chavePendencia(p) === chavePendenciaAlvo);
    if (!pendencia || pendencia.criticidade !== "melhora") return { ok: false as const, erro: "Só sugestões de melhora podem ser dispensadas." };
    await tx.fichaProduto.update({
      where: { id: fichaId },
      data: { pendenciasDispensadas: [...new Set([...achada.ficha.pendenciasDispensadas, chavePendenciaAlvo])] },
    });
    return { ok: true as const, versao: achada.ficha.versao };
  });
}

/**
 * Aprova a versão mais recente em rascunho: zero pendências que bloqueiam e
 * todos os blocos com campo deduzido pela IA revisados. A aprovada anterior
 * vira SUBSTITUIDA.
 */
export async function aprovarFicha(
  contaId: string,
  produtoId: string,
  fichaId: string,
  aprovadaPor: string,
  db: PrismaClient = obterDb(),
): Promise<ResultadoFicha | { ok: false; erro: string; motivos: string[] }> {
  return db.$transaction(async (tx) => {
    await travarFicha(tx, produtoId);
    const achada = await buscarFichaDaConta(tx, contaId, produtoId, fichaId);
    if (!achada) return { ok: false as const, erro: "Ficha não encontrada." };
    if (!achada.maisRecente) return { ok: false as const, erro: VERSAO_DESATUALIZADA };
    if (achada.ficha.status !== "RASCUNHO") return { ok: false as const, erro: "Esta versão não está em revisão." };
    const ficha = lerFicha(achada.ficha.conteudo);
    if (!ficha) return { ok: false as const, erro: "Não foi possível ler esta ficha." };
    const motivos = bloqueiosAprovacao(ficha, achada.ficha.blocosRevisados);
    if (motivos.length > 0) return { ok: false as const, erro: "Ainda não dá para aprovar.", motivos };
    await tx.fichaProduto.updateMany({ where: { produtoId, status: "APROVADA" }, data: { status: "SUBSTITUIDA" } });
    await tx.fichaProduto.update({
      where: { id: fichaId },
      data: { status: "APROVADA", aprovadaEm: new Date(), aprovadaPor },
    });
    return { ok: true as const, versao: achada.ficha.versao };
  });
}
