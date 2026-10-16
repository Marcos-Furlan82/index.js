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
  "Marca",
  "Produto",
  "Isca",
  "FichaProduto",
  "Referencia",
  "ConjuntoReferencias",
  "ReservaOrcamento",
  "Notificacao",
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

/** Cria usuário + sessão e coloca o cookie na requisição falsa (next-falso.ts). */
export async function entrarComoGestor() {
  const { criarSessaoNoBanco, nomeCookieSessao } = await import("@/auth/sessao");
  const { requisicaoFalsa } = await import("./next-falso");
  const usuario = await criarUsuario();
  const { token } = await criarSessaoNoBanco(obterDb(), usuario.id);
  requisicaoFalsa.cookies.set(nomeCookieSessao(), token);
  return usuario;
}
