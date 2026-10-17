import "dotenv/config";
import { executarLote } from "../src/jobs/executor";
import { desconectarDb } from "../src/lib/db";

/**
 * Desenvolvimento local: executa os jobs vencidos uma vez (sem Netlify).
 *   pnpm jobs:rodar
 */
async function main() {
  const resumo = await executarLote();
  console.log("Lote encerrado:", resumo);
  await desconectarDb();
}

main().catch(async (erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  await desconectarDb();
  process.exit(1);
});
