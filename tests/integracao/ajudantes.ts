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

export async function criarUsuario(email = "gestor@exemplo.com", senha = "senha-de-teste-forte") {
  const { gerarHashSenha } = await import("@/auth/senha");
  return obterDb().usuario.create({
    data: { email, nome: "Gestor", senhaHash: await gerarHashSenha(senha) },
  });
}
