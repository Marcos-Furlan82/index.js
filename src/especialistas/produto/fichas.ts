import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { faltandoParaGerar, type Faltante } from "@/briefing/obrigatorios";
import { podeGastar, type DecisaoGasto } from "@/custos/orcamento";
import { enfileirarJob, reenfileirarJob } from "@/jobs/fila";
import { obterDb } from "@/lib/db";
import { formatarBRL } from "@/lib/dinheiro";
import type { ResultadoEstimativa } from "./estimativa";
import { prepararGeracao } from "./gerar";

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
