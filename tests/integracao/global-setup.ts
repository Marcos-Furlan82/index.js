import { execFileSync } from "node:child_process";

/**
 * Aplica as migrations no banco de teste (DATABASE_URL_TEST) uma vez por execução.
 * Nunca roda contra DATABASE_URL para não apagar dados de desenvolvimento.
 */
export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error("Defina DATABASE_URL_TEST (banco Postgres só para testes).");
  }
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });
}
