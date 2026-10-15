import { obterDb, type ClienteDb } from "@/lib/db";
import { log } from "@/lib/log";
import { ErroPermanente, ErroTimeout } from "./erros";
import { concluir, registrarFalha, reivindicarProximo } from "./fila";
import { LIMITE_INVOCACAO_MS, MARGEM_CLAIM_MS } from "./limites";
import { maiorTimeout, REGISTRO, timeoutDe } from "./registro";
import type { Registro } from "./tipos";

export type OpcoesLote = {
  /** Tempo total disponível, contado a partir de `inicio`. Padrão: 15 min. */
  orcamentoMs?: number;
  inicio?: number;
  agora?: () => number;
  db?: ClienteDb;
  registro?: Registro;
};

export type ResumoLote = {
  executados: number;
  concluidos: number;
  falhas: number;
  motivoFim: "fila_vazia" | "tempo" | "timeout";
};

/**
 * Executa jobs vencidos até a fila esvaziar ou o tempo acabar.
 * Só reivindica um job se sobrar tempo para o maior timeout do registro + 1 min.
 * Se um handler estourar o timeout (mesmo ignorando o signal), o job é marcado
 * como falha e o lote é ENCERRADO: o handler pode continuar rodando em segundo
 * plano e não queremos acumular trabalho na mesma invocação.
 */
export async function executarLote(opcoes: OpcoesLote = {}): Promise<ResumoLote> {
  const agora = opcoes.agora ?? Date.now;
  const inicio = opcoes.inicio ?? agora();
  const orcamentoMs = opcoes.orcamentoMs ?? LIMITE_INVOCACAO_MS;
  const db = opcoes.db ?? obterDb();
  const registro = opcoes.registro ?? REGISTRO;
  const necessarioParaClaim = maiorTimeout(registro) + MARGEM_CLAIM_MS;
  const resumo: ResumoLote = { executados: 0, concluidos: 0, falhas: 0, motivoFim: "fila_vazia" };

  for (;;) {
    const restante = orcamentoMs - (agora() - inicio);
    if (restante < necessarioParaClaim) {
      resumo.motivoFim = "tempo";
      break;
    }
    const reivindicado = await reivindicarProximo(db);
    if (!reivindicado) break;
    const { job, ficha } = reivindicado;
    resumo.executados++;
    log.info("job: iniciando", { jobId: job.id, tipo: job.tipo, tentativas: job.tentativas });

    const def = registro[job.tipo];
    if (!def) {
      await registrarFalha(ficha, new ErroPermanente(`Tipo de job desconhecido: ${job.tipo}`), db);
      resumo.falhas++;
      continue;
    }
    const payload = def.schema.safeParse(job.payload);
    if (!payload.success) {
      await registrarFalha(ficha, new ErroPermanente(`Payload inválido: ${payload.error.message}`), db);
      resumo.falhas++;
      continue;
    }

    const timeoutMs = timeoutDe(def);
    const controle = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const estouro = new Promise<never>((_, rejeitar) => {
      timer = setTimeout(() => {
        const erro = new ErroTimeout(timeoutMs);
        controle.abort(erro);
        rejeitar(erro);
      }, timeoutMs);
    });
    const execucao = def.executar({ payload: payload.data, job, signal: controle.signal });
    // Se o handler terminar depois do timeout, o resultado é ignorado aqui.
    execucao.catch(() => {});

    try {
      const resultado = await Promise.race([execucao, estouro]);
      await concluir(ficha, resultado, db);
      resumo.concluidos++;
      log.info("job: concluído", { jobId: job.id, tipo: job.tipo, tentativas: job.tentativas });
    } catch (erro) {
      resumo.falhas++;
      await registrarFalha(ficha, erro, db);
      log.warn("job: falhou", { jobId: job.id, tipo: job.tipo, tentativas: job.tentativas, erro });
      if (erro instanceof ErroTimeout) {
        resumo.motivoFim = "timeout";
        break;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  return resumo;
}
