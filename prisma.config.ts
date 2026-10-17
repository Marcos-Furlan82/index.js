import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: a URL usada pelas migrations fica aqui, não no schema.
// Use a conexão DIRETA (sem pooler) do Neon para migrar; o app usa a pooled.
// Não usamos env() do Prisma porque ele falha quando a variável não existe,
// e "prisma generate" precisa rodar sem banco (CI e build).
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  ...(url ? { datasource: { url } } : {}),
});
