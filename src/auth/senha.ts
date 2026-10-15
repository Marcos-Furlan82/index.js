import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * Hash de senha com scrypt nativo do Node (sem dependências nativas).
 * Formato guardado: scrypt$N$r$p$salt(base64)$hash(base64).
 * Parâmetros conforme recomendação OWASP (N=2^17, r=8, p=1).
 */

const PADRAO = { N: 2 ** 17, r: 8, p: 1 };
const TAMANHO_HASH = 64;
const TAMANHO_SALT = 16;
export const TAMANHO_MINIMO_SENHA = 12;

function scrypt(senha: string, salt: Buffer, params: { N: number; r: number; p: number }) {
  const opcoes: ScryptOptions = { ...params, maxmem: 256 * params.N * params.r };
  return new Promise<Buffer>((resolve, reject) =>
    scryptCb(senha.normalize("NFKC"), salt, TAMANHO_HASH, opcoes, (erro, chave) =>
      erro ? reject(erro) : resolve(chave),
    ),
  );
}

export async function gerarHashSenha(senha: string): Promise<string> {
  const salt = randomBytes(TAMANHO_SALT);
  const hash = await scrypt(senha, salt, PADRAO);
  return ["scrypt", PADRAO.N, PADRAO.r, PADRAO.p, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  const partes = armazenado.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = partes;
  const esperado = Buffer.from(hashB64, "base64");
  const obtido = await scrypt(senha, Buffer.from(saltB64, "base64"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return esperado.length === obtido.length && timingSafeEqual(esperado, obtido);
}

/**
 * Hash fixo usado quando o e-mail não existe, para que o tempo de resposta
 * seja o mesmo de uma senha errada (não revela quais e-mails existem).
 */
const HASH_FICTICIO = `scrypt$${PADRAO.N}$${PADRAO.r}$${PADRAO.p}$${Buffer.alloc(TAMANHO_SALT).toString("base64")}$${Buffer.alloc(TAMANHO_HASH).toString("base64")}`;

export async function verificarSenhaFicticia(senha: string): Promise<false> {
  await verificarSenha(senha, HASH_FICTICIO);
  return false;
}

export function validarForcaSenha(senha: string): string | null {
  if (senha.length < TAMANHO_MINIMO_SENHA) {
    return `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }
  return null;
}
