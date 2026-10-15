import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { lerEnv, type Env } from "@/lib/env";

/**
 * Cloudflare R2 via API compatível com S3.
 * - Endpoint da conta, região "auto", path-style (funciona com qualquer nome de bucket).
 * - Checksums só quando exigidos: o SDK v3 recente adiciona CRC32 por padrão,
 *   o que quebraria o PUT feito pelo navegador com a URL pré-assinada.
 */

export const VALIDADE_URL_UPLOAD_S = 15 * 60;

export type ConfigR2 = Env<"r2">;

let clienteCache: { cliente: S3Client; config: ConfigR2 } | undefined;

export function criarClienteR2(config: ConfigR2): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.R2_ACCESS_KEY_ID,
      secretAccessKey: config.R2_SECRET_ACCESS_KEY,
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function r2(): { cliente: S3Client; config: ConfigR2 } {
  if (!clienteCache) {
    const config = lerEnv("r2");
    clienteCache = { cliente: criarClienteR2(config), config };
  }
  return clienteCache;
}

/** Só para testes. */
export function limparClienteR2() {
  clienteCache = undefined;
}

/**
 * URL PUT pré-assinada (15 min) com Content-Type e Content-Length assinados:
 * o navegador precisa enviar exatamente esse tipo e esse tamanho.
 * (R2 não aceita POST pré-assinado com content-length-range.)
 */
export async function gerarUrlUpload(dados: { chave: string; tipoMime: string; tamanhoBytes: number }) {
  const { cliente, config } = r2();
  const comando = new PutObjectCommand({
    Bucket: config.R2_BUCKET,
    Key: dados.chave,
    ContentType: dados.tipoMime,
    ContentLength: dados.tamanhoBytes,
  });
  return getSignedUrl(cliente, comando, {
    expiresIn: VALIDADE_URL_UPLOAD_S,
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}

export async function verificarObjeto(
  chave: string,
): Promise<{ tamanhoBytes: number; tipoMime: string | undefined } | null> {
  const { cliente, config } = r2();
  try {
    const r = await cliente.send(new HeadObjectCommand({ Bucket: config.R2_BUCKET, Key: chave }));
    return { tamanhoBytes: r.ContentLength ?? -1, tipoMime: r.ContentType };
  } catch (erro) {
    if (erro instanceof S3ServiceException && (erro.name === "NotFound" || erro.$metadata?.httpStatusCode === 404)) {
      return null;
    }
    throw erro;
  }
}

export async function removerObjeto(chave: string) {
  const { cliente, config } = r2();
  await cliente.send(new DeleteObjectCommand({ Bucket: config.R2_BUCKET, Key: chave }));
}

export function urlPublica(chave: string): string {
  const base = r2().config.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/${chave.split("/").map(encodeURIComponent).join("/")}`;
}
