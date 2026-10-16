import type { Job, PrismaClient } from "@/generated/prisma/client";
import { faltandoParaGerar } from "@/briefing/obrigatorios";
import { carregarContextoBriefing } from "@/briefing/salvar";
import { obterConfiguracao } from "@/custos/configuracao";
import { registrarUsosEConciliar } from "@/custos/registrar";
import { liberarReserva, reservarOrcamento } from "@/custos/reservas";
import { esquemaParaJson } from "@/ia/claude";
import { modelosCobraveis, PROVEDOR_IA } from "@/ia/config";
import { classificarErroIA, ErroIA } from "@/ia/erros";
import { obterClienteIA, type ClienteIA, type UsoModelo } from "@/ia";
import { ErroComEspera, ErroPermanente, ErroTimeout } from "@/jobs/erros";
import { obterDb, type ClienteDb } from "@/lib/db";
import { log } from "@/lib/log";
import { codigoPrisma, comRetryDeBanco, erroDeBancoTransitorio } from "@/lib/retry-banco";
import { notificar } from "@/notificacoes/notificacoes";
import {
  ESFORCO_FICHA,
  ESPECIALISTA_PRODUTO,
  MAX_TOKENS_FICHA,
  VALIDADE_RESERVA_FICHA_MS,
} from "./config";
import { montarMensagemFicha } from "./entrada";
import { esquemaFicha, esquemaSaidaIA, type Ficha } from "./esquema";
import { estimarMaximo } from "./estimativa";
import { SISTEMA_PRODUTO, VERSAO_PROMPT_PRODUTO } from "./prompt";
import { posProcessarFicha } from "./regras";

export type PayloadFicha = { produtoId: string; solicitacaoId: string; instrucao?: string; baseVersao?: number };

/** JSON Schema da saída (fixo): entra na estimativa de tokens de entrada. */
let esquemaJsonCache: string | undefined;
export function esquemaSaidaJson(): string {
  esquemaJsonCache ??= JSON.stringify(esquemaParaJson(esquemaSaidaIA));
  return esquemaJsonCache;
}

/** Lê a ficha guardada (null se o JSON não bater com o esquema). */
export function lerFicha(conteudo: unknown): Ficha | null {
  const r = esquemaFicha.safeParse(conteudo);
  return r.success ? r.data : null;
}

/**
 * Tudo o que a geração precisa: contexto do briefing, mensagem, estimativa
 * do custo máximo. Usado pela action (custo antes de gerar) e pelo job.
 */
export async function prepararGeracao(
  produtoId: string,
  extra: { instrucao?: string | null; baseVersao?: number | null },
  db: ClienteDb = obterDb(),
) {
  const produto = await db.produto.findUnique({ where: { id: produtoId }, include: { isca: true } });
  if (!produto) return null;
  const carregado = await carregarContextoBriefing(produto.contaId, produtoId, db);
  if (!carregado) return null;
  const { ctx, conta } = carregado;
  let fichaAnterior: Ficha | null = null;
  if (extra.baseVersao) {
    const anterior = await db.fichaProduto.findUnique({ where: { produtoId_versao: { produtoId, versao: extra.baseVersao } } });
    fichaAnterior = anterior ? lerFicha(anterior.conteudo) : null;
  }
  const mensagem = montarMensagemFicha(ctx, { fichaAnterior, instrucao: extra.instrucao });
  const modelos = modelosCobraveis();
  const [precos, config] = await Promise.all([
    db.precoModelo.findMany({ where: { provedor: PROVEDOR_IA, modelo: { in: modelos } } }),
    obterConfiguracao(db),
  ]);
  const estimativa = estimarMaximo({
    sistema: SISTEMA_PRODUTO,
    mensagem,
    esquemaJson: esquemaSaidaJson(),
    maxTokens: MAX_TOKENS_FICHA,
    modelos,
    precos,
    cotacaoUsdBrl: config.cotacaoUsdBrl,
  });
  return { ctx, conta, produto, mensagem, estimativa, iscaId: produto.isca?.id ?? null };
}

/**
 * Erros do job da ficha com mensagem FIXA (nunca dados do briefing, da
 * instrução ou da resposta da IA): é isso que vai para Job.erro e para o log.
 */
export function normalizarErroFicha(erro: unknown): Error {
  if (erro instanceof ErroTimeout || erro instanceof ErroComEspera) return erro;
  if (erro instanceof ErroPermanente) return erro;
  if (erro instanceof ErroIA) {
    if (erro.codigo === "saida_invalida") return new ErroPermanente("saida_invalida");
    if (erro.permanente) return new ErroPermanente(`ia:${erro.codigo}`);
    if (erro.esperaMs) return new ErroComEspera(`ia:${erro.codigo}`, erro.esperaMs);
    return new Error(`ia:${erro.codigo}`);
  }
  const nome = erro instanceof Error ? erro.name : "";
  if (nome === "SyntaxError" || nome === "ZodError") return new ErroPermanente("saida_invalida");
  if (nome.startsWith("PrismaClient")) {
    const codigo = codigoPrisma(erro);
    if (erroDeBancoTransitorio(erro)) return new Error(`erro_interno:banco:${codigo}`);
    return new ErroPermanente("erro_interno:banco");
  }
  return new Error("erro_interno");
}

function linkFicha(contaId: string, produtoId: string) {
  return `/contas/${contaId}/produtos/${produtoId}/ficha`;
}

/** Mensagem do aviso de erro (sem dados do briefing). */
export function mensagemErroFicha(codigo: string): string {
  if (codigo === "orcamento:teto_geral" || codigo === "orcamento:teto_conta") {
    return "O orçamento de IA deste mês acabou. Ajuste o teto em Orçamento ou espere o dia 1º. Suas respostas estão salvas.";
  }
  if (codigo.startsWith("orcamento:")) {
    return "Defina o teto mensal de gastos com IA, a cotação do dólar e os preços dos modelos em Orçamento antes de gerar.";
  }
  return "Não conseguimos gerar a ficha agora. Suas respostas estão salvas.";
}

async function criarVersaoIA(
  db: PrismaClient,
  dados: { produtoId: string; contaId: string; ficha: Ficha; jobId: string; modelo: string; instrucao?: string; baseVersao?: number },
) {
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS ok FROM (SELECT pg_advisory_xact_lock(hashtextextended(${`ficha:${dados.produtoId}`}, 0))) AS trava`;
      const ultima = await tx.fichaProduto.aggregate({ where: { produtoId: dados.produtoId }, _max: { versao: true } });
      const ficha = await tx.fichaProduto.create({
        data: {
          produtoId: dados.produtoId,
          contaId: dados.contaId,
          versao: (ultima._max.versao ?? 0) + 1,
          status: "RASCUNHO",
          origem: "IA",
          conteudo: dados.ficha,
          versaoPrompt: VERSAO_PROMPT_PRODUTO,
          modelo: dados.modelo,
          jobId: dados.jobId,
          instrucao: dados.instrucao ?? null,
          baseVersao: dados.baseVersao ?? null,
        },
      });
      return { ficha, nova: true };
    });
  } catch (erro) {
    // Execução órfã ou repetida: a ficha deste job já existe. Sucesso, sem duplicar.
    if (codigoPrisma(erro) === "P2002") {
      const existente = await db.fichaProduto.findUnique({ where: { jobId: dados.jobId } });
      if (existente) return { ficha: existente, nova: false };
    }
    throw erro;
  }
}

export type DependenciasFicha = {
  db?: PrismaClient;
  cliente?: ClienteIA;
  agora?: () => Date;
  esperasRetry?: readonly number[];
};

/**
 * Job "gerar-ficha-produto". Idempotente: se a ficha deste job já existe,
 * devolve sem chamar a API. Ordem: contexto → estimativa → reserva → API →
 * custo real (conciliação) → pós-processamento → nova versão RASCUNHO → aviso.
 * A reserva é liberada só quando a chamada comprovadamente não foi cobrada.
 */
export async function gerarFichaProduto(
  payload: PayloadFicha,
  execucao: { job: Pick<Job, "id" | "tentativas" | "maxTentativas">; signal: AbortSignal },
  deps: DependenciasFicha = {},
) {
  const db = deps.db ?? obterDb();
  const agora = deps.agora ?? (() => new Date());
  const { job, signal } = execucao;

  const existente = await db.fichaProduto.findUnique({ where: { jobId: job.id } });
  if (existente) return { fichaId: existente.id, versao: existente.versao, repetido: true };

  let reservaId: string | null = null;
  let liberar = false;
  let contaId: string | null = null;

  const conciliar = async (usos: UsoModelo[]) => {
    try {
      await registrarUsosEConciliar(
        {
          reservaId,
          contaId,
          especialista: ESPECIALISTA_PRODUTO,
          versaoPrompt: VERSAO_PROMPT_PRODUTO,
          provedor: PROVEDOR_IA,
          tipo: "TEXTO",
          usos,
        },
        db,
        agora(),
        deps.esperasRetry,
      );
    } catch (erro) {
      // A reserva fica ATIVA até expirar (o valor continua contando).
      log.error("ficha: falha ao registrar o custo", { jobId: job.id, reservaId, codigo: codigoPrisma(erro) ?? "desconhecido" });
      throw new ErroPermanente("erro_interno:conciliacao");
    }
  };

  try {
    const prep = await prepararGeracao(payload.produtoId, payload, db);
    if (!prep || prep.conta.arquivadaEm || prep.produto.arquivadoEm) throw new ErroPermanente("produto_indisponivel");
    const idConta = prep.conta.id;
    contaId = idConta;
    if (faltandoParaGerar(prep.ctx).length > 0) throw new ErroPermanente("briefing_incompleto");
    if (!prep.estimativa.ok) {
      throw new ErroPermanente(prep.estimativa.motivo === "sem_preco" ? "orcamento:sem_preco" : "orcamento:orcamento_nao_configurado");
    }

    const reserva = await reservarOrcamento(
      { contaId: idConta, valorBrl: prep.estimativa.maximoBrl, validadeMs: VALIDADE_RESERVA_FICHA_MS, origem: `job:${job.id}` },
      db,
      agora(),
    );
    if (!reserva.ok) throw new ErroPermanente(`orcamento:${reserva.decisao.motivo}`);
    reservaId = reserva.reservaId;
    liberar = true;

    let resposta;
    try {
      resposta = await (deps.cliente ?? obterClienteIA()).gerarEstruturado({
        sistema: SISTEMA_PRODUTO,
        mensagem: prep.mensagem,
        esquema: esquemaSaidaIA,
        maxTokens: MAX_TOKENS_FICHA,
        esforco: ESFORCO_FICHA,
        signal,
      });
    } catch (erro) {
      const e = erro instanceof ErroIA ? erro : classificarErroIA(erro, { iniciado: true });
      if (e.cobrado) {
        // Pode ter sido cobrada: nunca libera. Com uso medido, registra já; sem, a reserva expira.
        liberar = false;
        if (e.usos.length > 0) await conciliar(e.usos);
      }
      throw e;
    }
    liberar = false;
    await conciliar(resposta.usos);

    // Daqui em diante o resultado já foi pago: grava mesmo que o tempo acabe.
    const ficha = esquemaFicha.parse(posProcessarFicha(resposta.dados, prep.ctx, prep.iscaId));
    const { ficha: criada, nova } = await comRetryDeBanco(
      () =>
        criarVersaoIA(db, {
          produtoId: prep.produto.id,
          contaId: idConta,
          ficha,
          jobId: job.id,
          modelo: resposta.modelo,
          instrucao: payload.instrucao,
          baseVersao: payload.baseVersao,
        }),
      deps.esperasRetry,
    );
    if (nova) {
      await notificar(
        {
          contaId: idConta,
          tipo: "ficha_pronta",
          titulo: "Ficha do produto pronta",
          mensagem: `A ficha de ${prep.produto.nome} (versão ${criada.versao}) está pronta para você revisar.`,
          link: linkFicha(idConta, prep.produto.id),
        },
        db,
      );
    }
    return { fichaId: criada.id, versao: criada.versao, repetido: !nova };
  } catch (erro) {
    const normalizado = normalizarErroFicha(erro);
    log.warn("ficha: falha na geração", { jobId: job.id, nome: normalizado.name, codigo: normalizado.message });
    const definitivo = normalizado instanceof ErroPermanente || job.tentativas >= job.maxTentativas;
    if (definitivo) {
      try {
        const produto = await db.produto.findUnique({ where: { id: payload.produtoId }, select: { contaId: true, nome: true } });
        if (produto) {
          await notificar(
            {
              contaId: produto.contaId,
              tipo: "ficha_erro",
              titulo: `Não conseguimos gerar a ficha de ${produto.nome}`,
              mensagem: mensagemErroFicha(normalizado.message),
              link: linkFicha(produto.contaId, payload.produtoId),
            },
            db,
          );
        }
      } catch {
        log.error("ficha: falha ao avisar o erro", { jobId: job.id });
      }
    }
    throw normalizado;
  } finally {
    if (reservaId && liberar) {
      await liberarReserva(reservaId, db).catch(() => log.error("ficha: falha ao liberar a reserva", { jobId: job.id, reservaId }));
    }
  }
}
