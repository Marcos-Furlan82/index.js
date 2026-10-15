import { executarLote } from "../../src/jobs/executor";
import { HEADER_SEGREDO_JOBS, segredoConfere } from "../../src/jobs/segredo";
import { usarPoolDasFuncoes } from "../../src/lib/db";
import { lerEnv } from "../../src/lib/env";
import { log } from "../../src/lib/log";

usarPoolDasFuncoes();

/**
 * Background Function (sufixo -background: até 15 min; o Netlify responde 202
 * na hora e descarta o retorno). O endpoint é público, então exige JOBS_SECRET.
 */
export default async function executarJobsBackground(req: Request) {
  const inicio = Date.now();
  if (!segredoConfere(req.headers.get(HEADER_SEGREDO_JOBS), lerEnv("jobs").JOBS_SECRET)) {
    log.warn("executor: chamada sem segredo válido");
    return new Response("Não autorizado", { status: 401 });
  }
  const resumo = await executarLote({ inicio });
  log.info("executor: lote encerrado", resumo);
  return Response.json(resumo);
}
