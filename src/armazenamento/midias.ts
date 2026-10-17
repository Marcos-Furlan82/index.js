import { randomUUID } from "node:crypto";
import { z } from "zod";
import { mesReferencia } from "@/lib/datas";
import { obterDb, type ClienteDb } from "@/lib/db";
import { log } from "@/lib/log";
import { gerarUrlUpload, removerObjeto, urlPublica, verificarObjeto } from "./r2";

const MB = 1024 * 1024;

/** Tipos aceitos. A extensão vem deste mapa, nunca do nome do arquivo. */
export const TIPOS_ACEITOS = {
  "image/jpeg": { extensao: "jpg", maxBytes: 20 * MB },
  "image/png": { extensao: "png", maxBytes: 20 * MB },
  "image/webp": { extensao: "webp", maxBytes: 20 * MB },
  "video/mp4": { extensao: "mp4", maxBytes: 300 * MB },
  "video/quicktime": { extensao: "mov", maxBytes: 300 * MB },
} as const;

export type TipoAceito = keyof typeof TIPOS_ACEITOS;

export const esquemaSolicitacao = z
  .object({
    tipoMime: z.string(),
    tamanhoBytes: z.number().int().positive("Arquivo vazio."),
    nomeOriginal: z.string().trim().min(1).max(255),
    contaId: z.string().uuid().nullish(),
  })
  .superRefine((v, ctx) => {
    const tipo = TIPOS_ACEITOS[v.tipoMime as TipoAceito];
    if (!tipo) {
      ctx.addIssue({ code: "custom", path: ["tipoMime"], message: "Tipo de arquivo não permitido." });
      return;
    }
    if (v.tamanhoBytes > tipo.maxBytes) {
      ctx.addIssue({
        code: "custom",
        path: ["tamanhoBytes"],
        message: `Arquivo grande demais (máximo ${tipo.maxBytes / MB} MB).`,
      });
    }
  });

export type Solicitacao = z.infer<typeof esquemaSolicitacao>;

export function gerarChave(contaId: string | null | undefined, tipoMime: TipoAceito, agora = new Date()) {
  const [ano, mes] = mesReferencia(agora).split("-");
  return `contas/${contaId ?? "geral"}/${ano}/${mes}/${randomUUID()}.${TIPOS_ACEITOS[tipoMime].extensao}`;
}

export type ResultadoSolicitacao =
  | { ok: true; midiaId: string; url: string; tipoMime: string }
  | { ok: false; erro: string };

/** Cria a Mídia PENDENTE e devolve a URL PUT pré-assinada. */
export async function solicitarUpload(
  entrada: unknown,
  db: ClienteDb = obterDb(),
): Promise<ResultadoSolicitacao> {
  const dados = esquemaSolicitacao.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const tipoMime = dados.data.tipoMime as TipoAceito;
  const chave = gerarChave(dados.data.contaId, tipoMime);
  const midia = await db.midia.create({
    data: {
      contaId: dados.data.contaId ?? null,
      origem: "UPLOAD",
      status: "PENDENTE",
      chave,
      tipoMime,
      tamanhoBytes: BigInt(dados.data.tamanhoBytes),
      nomeOriginal: dados.data.nomeOriginal,
    },
  });
  const url = await gerarUrlUpload({ chave, tipoMime, tamanhoBytes: dados.data.tamanhoBytes });
  return { ok: true, midiaId: midia.id, url, tipoMime };
}

export type ResultadoConfirmacao =
  | { ok: true; urlPublica: string }
  | { ok: false; erro: string };

/**
 * Depois do PUT: confere no R2 se o objeto existe com o tamanho e o tipo
 * combinados. Se não bater, apaga e marca como REJEITADA. Só age em mídia PENDENTE.
 */
export async function confirmarUpload(midiaId: string, db: ClienteDb = obterDb()): Promise<ResultadoConfirmacao> {
  const midia = await db.midia.findUnique({ where: { id: midiaId } });
  if (!midia || midia.status !== "PENDENTE") return { ok: false, erro: "Upload não encontrado ou já confirmado." };

  const objeto = await verificarObjeto(midia.chave);
  const confere =
    objeto !== null && BigInt(objeto.tamanhoBytes) === midia.tamanhoBytes && objeto.tipoMime === midia.tipoMime;

  if (!confere) {
    if (objeto) await removerObjeto(midia.chave);
    await db.midia.updateMany({ where: { id: midia.id, status: "PENDENTE" }, data: { status: "REJEITADA" } });
    log.warn("upload rejeitado", { midiaId: midia.id, encontrado: objeto !== null });
    return { ok: false, erro: objeto ? "O arquivo enviado não confere com o informado." : "Arquivo não encontrado no armazenamento." };
  }

  const url = urlPublica(midia.chave);
  const { count } = await db.midia.updateMany({
    where: { id: midia.id, status: "PENDENTE" },
    data: { status: "DISPONIVEL", urlPublica: url, confirmadoEm: new Date() },
  });
  if (count === 0) return { ok: false, erro: "Upload não encontrado ou já confirmado." };
  return { ok: true, urlPublica: url };
}
