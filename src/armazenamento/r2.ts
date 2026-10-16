import {
  DeleteObjectCommand,
  GetObjectCommand,
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
 * - Duas áreas com o mesmo token: "publica" (R2_BUCKET, domínio público, mídia
 *   publicada) e "privada" (R2_BUCKET_PRIVADO, sem domínio público: referências
 *   da marca, lidas só por URL GET assinada de 5 minutos).
 */

export const VALIDADE_URL_UPLOAD_S = 15 * 60;
export const VALIDADE_URL_LEITURA_S = 5 * 60;

export type ConfigR2 = Env<"r2">;
export type AreaR2 = "publica" | "privada";

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

export function bucketDa(area: AreaR2): string {
  return area === "privada" ? lerEnv("r2Privado").R2_BUCKET_PRIVADO : r2().config.R2_BUCKET;
}

/**
 * URL PUT pré-assinada (15 min) com Content-Type e Content-Length assinados:
 * o navegador precisa enviar exatamente esse tipo e esse tamanho.
 * (R2 não aceita POST pré-assinado com content-length-range.)
 */
export async function gerarUrlUpload(dados: {
  chave: string;
  tipoMime: string;
  tamanhoBytes: number;
  area?: AreaR2;
}) {
  const { cliente } = r2();
  const comando = new PutObjectCommand({
    Bucket: bucketDa(dados.area ?? "publica"),
    Key: dados.chave,
    ContentType: dados.tipoMime,
    ContentLength: dados.tamanhoBytes,
  });
  return getSignedUrl(cliente, comando, {
    expiresIn: VALIDADE_URL_UPLOAD_S,
    signableHeaders: new Set(["content-type", "content-length"]),
  });
}

function naoEncontrado(erro: unknown): boolean {
  return (
    erro instanceof S3ServiceException &&
    (erro.name === "NotFound" || erro.name === "NoSuchKey" || erro.$metadata?.httpStatusCode === 404)
  );
}

export async function verificarObjeto(
  chave: string,
  area: AreaR2 = "publica",
): Promise<{ tamanhoBytes: number; tipoMime: string | undefined } | null> {
  const { cliente } = r2();
  try {
    const r = await cliente.send(new HeadObjectCommand({ Bucket: bucketDa(area), Key: chave }));
    return { tamanhoBytes: r.ContentLength ?? -1, tipoMime: r.ContentType };
  } catch (erro) {
    if (naoEncontrado(erro)) return null;
    throw erro;
  }
}

/** Apaga o objeto. Objeto inexistente não é erro. */
export async function removerObjeto(chave: string, area: AreaR2 = "publica") {
  const { cliente } = r2();
  try {
    await cliente.send(new DeleteObjectCommand({ Bucket: bucketDa(area), Key: chave }));
  } catch (erro) {
    if (!naoEncontrado(erro)) throw erro;
  }
}

/**
 * Lê o objeto inteiro em memória, recusando passar de `limiteBytes`
 * (protege a função de arquivos maiores que o combinado). Null se não existe.
 */
export async function lerObjeto(chave: string, area: AreaR2, limiteBytes: number): Promise<Buffer | null> {
  const { cliente } = r2();
  let resposta;
  try {
    resposta = await cliente.send(new GetObjectCommand({ Bucket: bucketDa(area), Key: chave }));
  } catch (erro) {
    if (naoEncontrado(erro)) return null;
    throw erro;
  }
  if ((resposta.ContentLength ?? 0) > limiteBytes) throw new Error("Objeto maior que o limite.");
  const corpo = resposta.Body;
  if (!corpo) return Buffer.alloc(0);
  const bytes = await corpo.transformToByteArray();
  if (bytes.byteLength > limiteBytes) throw new Error("Objeto maior que o limite.");
  return Buffer.from(bytes);
}

export async function gravarObjeto(chave: string, corpo: Buffer, tipoMime: string, area: AreaR2) {
  const { cliente } = r2();
  await cliente.send(
    new PutObjectCommand({
      Bucket: bucketDa(area),
      Key: chave,
      Body: corpo,
      ContentType: tipoMime,
      ContentLength: corpo.byteLength,
    }),
  );
}

/**
 * URL GET assinada de 5 minutos (gerada a cada renderização). Com `nomeDownload`,
 * o navegador baixa o arquivo em vez de abrir (usado no SVG original).
 */
export async function gerarUrlLeitura(
  chave: string,
  opcoes: { area?: AreaR2; nomeDownload?: string; tipoMime?: string } = {},
): Promise<string> {
  const { cliente } = r2();
  const comando = new GetObjectCommand({
    Bucket: bucketDa(opcoes.area ?? "privada"),
    Key: chave,
    ...(opcoes.nomeDownload
      ? { ResponseContentDisposition: `attachment; filename="${opcoes.nomeDownload.replace(/[^\w.-]+/g, "_")}"` }
      : {}),
    ...(opcoes.tipoMime ? { ResponseContentType: opcoes.tipoMime } : {}),
  });
  return getSignedUrl(cliente, comando, { expiresIn: VALIDADE_URL_LEITURA_S });
}

export function urlPublica(chave: string): string {
  const base = r2().config.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/${chave.split("/").map(encodeURIComponent).join("/")}`;
}
