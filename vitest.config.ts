import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const raiz = fileURLToPath(new URL("./", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    root: raiz,
    env: { LOG_SILENCIOSO: "1" },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "netlify/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integracao",
          include: ["tests/integracao/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integracao/global-setup.ts"],
          setupFiles: ["tests/integracao/setup.ts"],
          // Um único banco de teste: arquivos em série.
          fileParallelism: false,
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
