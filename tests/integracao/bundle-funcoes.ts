import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

/**
 * Empacota as funções de netlify/functions do mesmo jeito que o Netlify faz com
 * funções "v2" (export default + Request): bundler NFT do zip-it-and-ship-it,
 * que roda esbuild com bundle: true, packages: "external", formato ESM para .mts,
 * plataforma node e o shim de CommonJS abaixo. O código local (src/ e o client
 * do Prisma gerado em src/generated) entra no bundle; node_modules fica de fora
 * e é resolvido em tempo de execução.
 */
const SHIM_CJS = `
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);
`;

const RAIZ = path.resolve(import.meta.dirname, "../..");
const PASTA_FUNCOES = path.join(RAIZ, "netlify/functions");
// Dentro do repositório para que os pacotes externos sejam resolvidos em node_modules.
const PASTA_SAIDA = path.join(RAIZ, "tmp-testes/funcoes");

export async function listarFuncoes(): Promise<string[]> {
  const arquivos = await readdir(PASTA_FUNCOES);
  return arquivos.filter((a) => a.endsWith(".mts")).map((a) => a.replace(/\.mts$/, ""));
}

export async function empacotarFuncao(nome: string): Promise<string> {
  await mkdir(PASTA_SAIDA, { recursive: true });
  const saida = path.join(PASTA_SAIDA, `${nome}.mjs`);
  await build({
    entryPoints: [path.join(PASTA_FUNCOES, `${nome}.mts`)],
    outfile: saida,
    bundle: true,
    packages: "external",
    format: "esm",
    platform: "node",
    target: ["node22"],
    banner: { js: SHIM_CJS },
    logLevel: "error",
  });
  return saida;
}

export type ModuloFuncao = {
  default: (req: Request, context: unknown) => Promise<Response | void>;
  config?: Record<string, unknown>;
};

export async function carregarFuncao(nome: string): Promise<ModuloFuncao> {
  const arquivo = await empacotarFuncao(nome);
  // Query string evita o cache de import entre testes.
  return import(`${pathToFileURL(arquivo).href}?t=${Date.now()}`) as Promise<ModuloFuncao>;
}

export function contextoFalso(siteUrl = "http://localhost:8888") {
  return {
    site: { id: "site-teste", name: "teste", url: siteUrl },
    deploy: { context: "production", id: "deploy-teste", published: true },
    account: { id: "conta-teste" },
    ip: "127.0.0.1",
    requestId: "req-teste",
    waitUntil: () => {},
  };
}
