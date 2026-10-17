import type { Config, Context } from "@netlify/functions";
import { despachar } from "../../src/jobs/despachante";
import { usarPoolDasFuncoes } from "../../src/lib/db";
import { lerEnv } from "../../src/lib/env";

usarPoolDasFuncoes();

/**
 * Scheduled Function (a cada 2 min, horário UTC; só roda em deploys publicados
 * de produção). Recupera jobs travados e dispara a Background Function.
 */
export default async function despacharJobs(_req: Request, context: Context) {
  const env = lerEnv("jobs");
  const baseUrl = context?.site?.url || process.env.URL || lerEnv("app").APP_URL;
  if (!baseUrl) throw new Error("URL do site indisponível (context.site.url, URL ou APP_URL).");
  const resumo = await despachar({
    baseUrl,
    segredo: env.JOBS_SECRET,
    paralelismo: env.JOBS_PARALELISMO,
  });
  return Response.json(resumo);
}

export const config: Config = {
  schedule: "*/2 * * * *",
};
