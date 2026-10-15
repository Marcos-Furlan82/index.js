import { afterAll, beforeEach } from "vitest";
import { limparCacheEnv } from "@/lib/env";
import { desconectarDb } from "@/lib/db";
import { limparBanco } from "./ajudantes";

// Todos os testes de integração usam o banco de teste.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.DIRECT_URL = process.env.DATABASE_URL_TEST;
process.env.JOBS_SECRET ??= "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";
process.env.EMAIL_PROVEDOR = "memoria";
limparCacheEnv();

beforeEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await desconectarDb();
});
