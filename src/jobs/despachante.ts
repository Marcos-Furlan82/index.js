import { obterDb, type ClienteDb } from "@/lib/db";
import { log } from "@/lib/log";
import { garantirJobsDiarios } from "./agendamentos";
import { contarAtivos, contarVencidos, recuperarTravados } from "./fila";
import { HEADER_SEGREDO_JOBS } from "./segredo";

export const CAMINHO_EXECUTOR = "/.netlify/functions/executar-jobs-background";
export const TIMEOUT_DISPARO_MS = 5_000;

export type OpcoesDespacho = {
  baseUrl: string;
  segredo: string;
  paralelismo: number;
  db?: ClienteDb;
  fetch?: typeof fetch;
};

export type ResumoDespacho = {
  recuperados: number;
  vencidos: number;
  ativos: number;
  disparados: number;
  falhasDisparo: number;
};

/**
 * Chamado pela Scheduled Function: recupera travados e dispara até
 * max(0, min(vencidos, paralelismo - ativos)) execuções da Background Function.
 * Cada disparo espera só a resposta 202 (até 5 s); quem executa é a Background.
 * No fim, garante os jobs diários (manutenção).
 */
export async function despachar(opcoes: OpcoesDespacho): Promise<ResumoDespacho> {
  const db = opcoes.db ?? obterDb();
  const fazerFetch = opcoes.fetch ?? fetch;
  const recuperados = await recuperarTravados(db);
  const vencidos = await contarVencidos(db);
  const ativos = vencidos > 0 ? await contarAtivos(db) : 0;
  const quantidade = Math.max(0, Math.min(vencidos, opcoes.paralelismo - ativos));
  const url = new URL(CAMINHO_EXECUTOR, opcoes.baseUrl).toString();

  const resultados = await Promise.allSettled(
    Array.from({ length: quantidade }, async () => {
      const resposta = await fazerFetch(url, {
        method: "POST",
        headers: { [HEADER_SEGREDO_JOBS]: opcoes.segredo },
        signal: AbortSignal.timeout(TIMEOUT_DISPARO_MS),
      });
      if (resposta.status !== 202) throw new Error(`Executor respondeu ${resposta.status}`);
    }),
  );
  const falhas = resultados.filter((r) => r.status === "rejected");
  for (const falha of falhas) {
    // Sem headers no log (levam o segredo).
    log.error("despacho: falha ao disparar executor", {
      url,
      erro: (falha as PromiseRejectedResult).reason,
    });
  }
  const resumo = {
    recuperados,
    vencidos,
    ativos,
    disparados: quantidade - falhas.length,
    falhasDisparo: falhas.length,
  };
  // Depois do disparo: o job diário criado agora entra no próximo despacho.
  try {
    await garantirJobsDiarios(db);
  } catch (erro) {
    log.error("despacho: falha ao agendar jobs diários", { erro });
  }
  log.info("despacho: concluído", resumo);
  return resumo;
}
