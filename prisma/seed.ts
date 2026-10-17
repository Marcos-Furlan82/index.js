import "dotenv/config";
import { criarDb } from "../src/lib/db";

/**
 * Seed mínimo e idempotente: só a configuração global.
 * - Teto mensal padrão de R$ 1.000.
 * - Cotação do dólar fica vazia: o gestor cadastra em Configurações → Orçamento.
 * - A tabela de preços dos modelos começa vazia: o gestor cadastra cada modelo.
 * Sem cotação e preços, nenhuma geração de IA é liberada (orcamento_nao_configurado).
 */
async function main() {
  const db = criarDb({ poolMax: 1 });
  try {
    await db.configuracao.upsert({
      where: { id: "global" },
      update: {},
      create: { id: "global", tetoMensalBrl: "1000" },
    });
    console.log("Seed concluído: configuração global pronta (teto R$ 1.000).");
  } finally {
    await db.$disconnect();
  }
}

main().catch((erro) => {
  console.error("Falha no seed:", erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
