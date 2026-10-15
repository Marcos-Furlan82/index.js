import type { Config } from "@netlify/functions";
import { obterDb, usarPoolDasFuncoes } from "../../src/lib/db";

usarPoolDasFuncoes();

export default async function despacharJobs() {
  const vencidos = await obterDb().job.count({
    where: { status: "PENDENTE", executarEm: { lte: new Date() } },
  });
  return Response.json({ vencidos });
}

export const config: Config = {
  schedule: "*/2 * * * *",
};
