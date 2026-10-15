import "dotenv/config";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { normalizarEmail } from "../src/auth/login";
import { gerarHashSenha, validarForcaSenha } from "../src/auth/senha";
import { criarDb } from "../src/lib/db";

/**
 * Cria o usuário gestor (não há cadastro público) ou redefine a senha.
 *
 *   pnpm gestor:criar --email voce@exemplo.com --nome "Seu Nome"
 *   pnpm gestor:criar --email voce@exemplo.com --redefinir
 *
 * A senha é lida do terminal sem eco (ou da primeira linha da entrada padrão,
 * para automação). Redefinir encerra todas as sessões do usuário.
 */

function lerSenhaSemEco(pergunta: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const saida = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    process.stdout.write(pergunta);
    saida._writeToOutput = (s: string) => {
      if (s.includes("\n") || s.includes("\r")) saida.output.write("\n");
    };
    rl.question("", (resposta) => {
      rl.close();
      resolve(resposta);
    });
  });
}

async function lerLinhaDaEntrada(): Promise<string> {
  let texto = "";
  for await (const pedaco of process.stdin) texto += String(pedaco);
  return texto.split(/\r?\n/)[0] ?? "";
}

async function obterSenha(): Promise<string> {
  if (!process.stdin.isTTY) return lerLinhaDaEntrada();
  const senha = await lerSenhaSemEco("Senha (mínimo 12 caracteres): ");
  const confirmacao = await lerSenhaSemEco("Repita a senha: ");
  if (senha !== confirmacao) throw new Error("As senhas não conferem.");
  return senha;
}

async function main() {
  const { values } = parseArgs({
    options: {
      email: { type: "string" },
      nome: { type: "string" },
      redefinir: { type: "boolean", default: false },
    },
  });
  if (!values.email) throw new Error("Informe --email.");
  const email = normalizarEmail(values.email);

  const db = criarDb({ poolMax: 1 });
  try {
    const existente = await db.usuario.findUnique({ where: { email } });
    if (existente && !values.redefinir) {
      throw new Error("Esse e-mail já existe. Use --redefinir para trocar a senha.");
    }
    if (!existente && values.redefinir) throw new Error("Usuário não encontrado.");
    if (!existente && !values.nome) throw new Error("Informe --nome.");

    const senha = await obterSenha();
    const problema = validarForcaSenha(senha);
    if (problema) throw new Error(problema);
    const senhaHash = await gerarHashSenha(senha);

    if (existente) {
      await db.$transaction([
        db.usuario.update({ where: { id: existente.id }, data: { senhaHash } }),
        db.sessao.deleteMany({ where: { usuarioId: existente.id } }),
        db.tentativaLogin.deleteMany({ where: { email } }),
      ]);
      console.log(`Senha redefinida para ${email}. Sessões anteriores encerradas.`);
    } else {
      await db.usuario.create({ data: { email, nome: values.nome!, senhaHash } });
      console.log(`Gestor criado: ${email}.`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((erro) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exit(1);
});
