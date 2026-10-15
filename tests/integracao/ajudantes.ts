import { obterDb } from "@/lib/db";

const TABELAS = [
  "Sessao",
  "Usuario",
  "TentativaLogin",
  "Job",
  "Midia",
  "GeracaoIA",
  "AlertaOrcamento",
  "PrecoModelo",
  "Configuracao",
  "ContaInstagram",
];

export async function limparBanco() {
  const lista = TABELAS.map((t) => `"${t}"`).join(", ");
  await obterDb().$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}
