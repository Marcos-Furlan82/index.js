import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { CategoriaReferencia, Midia, PrismaClient, Referencia } from "@/generated/prisma/client";
import { lerBriefingMarca } from "@/briefing/esquemas";
import { obterDb, type ClienteDb } from "@/lib/db";
import { log } from "@/lib/log";
import { ErroImagem, gerarMiniatura, inspecionarImagem } from "./imagem";
import { armazenamentoLocalAtivo, urlLocal } from "./local";
import { gerarUrlLeitura, gerarUrlUpload, gravarObjeto, lerObjeto, removerObjeto, verificarObjeto } from "./r2";
import { sanitizarSvg } from "./svg";
import { detectarTipoReal, tiposCompativeis, type TipoReal } from "./tipo-real";

/**
 * Referências visuais da marca, SEMPRE no bucket privado (inclusive artes de
 * terceiros, que nunca são publicadas nem usadas como base de geração).
 * Upload direto do navegador (PUT assinado) e validação síncrona na confirmação:
 * tipo real pelos bytes, duplicata por sha256, tamanho mínimo, SVG limpo,
 * miniatura WebP separada (o original é guardado sem recompressão).
 */

const MB = 1024 * 1024;
export const TAMANHO_MAX_REFERENCIA = 15 * MB;
export const MAX_ARTES = 10;
export const MIN_ARTES = 3;
export const LARGURA_MIN_ARTE = 1080;
export const LADO_MIN_LOGO = 1000;
const PRAZO_PENDENTE_CONTA_MS = 60 * 60 * 1000;

const EXTENSAO: Record<TipoReal, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
  "application/postscript": "eps",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "font/woff2": "woff2",
};

const POR_EXTENSAO: Record<string, TipoReal> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  ai: "application/postscript",
  eps: "application/postscript",
  ttf: "font/ttf",
  otf: "font/otf",
  woff2: "font/woff2",
};

const LOGOS: TipoReal[] = ["image/svg+xml", "image/png", "image/jpeg", "image/webp", "application/pdf", "application/postscript"];

/** Tipos aceitos por categoria. PDF/AI/EPS enviados como logo viram "arquivo-fonte". */
export const TIPOS_REFERENCIA: Record<CategoriaReferencia, TipoReal[]> = {
  LOGO: LOGOS,
  LOGO_NEGATIVO: LOGOS,
  SIMBOLO: LOGOS,
  LOGO_ARQUIVO_FONTE: ["application/pdf", "application/postscript"],
  FONTE: ["font/ttf", "font/otf", "font/woff2"],
  ARTE: ["image/jpeg", "image/png", "image/webp"],
  PROVA: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};

export const ACEITAR_INPUT: Record<CategoriaReferencia, string> = {
  LOGO: ".svg,.png,.jpg,.jpeg,.webp,.pdf,.ai,.eps",
  LOGO_NEGATIVO: ".svg,.png,.jpg,.jpeg,.webp,.pdf,.ai,.eps",
  SIMBOLO: ".svg,.png,.jpg,.jpeg,.webp,.pdf,.ai,.eps",
  LOGO_ARQUIVO_FONTE: ".pdf,.ai,.eps",
  FONTE: ".ttf,.otf,.woff2",
  ARTE: ".jpg,.jpeg,.png,.webp",
  PROVA: ".jpg,.jpeg,.png,.webp,.pdf",
};

const CATEGORIAS_LOGO: CategoriaReferencia[] = ["LOGO", "LOGO_NEGATIVO", "SIMBOLO"];

/** Tipo declarado: o do navegador, ou pela extensão quando vem vazio/genérico (fontes, .ai, .eps). */
export function tipoDeclarado(tipoMime: string, nomeOriginal: string): TipoReal | null {
  const tipo = (tipoMime ?? "").toLowerCase();
  if ((EXTENSAO as Record<string, string>)[tipo]) return tipo as TipoReal;
  const extensao = nomeOriginal.split(".").pop()?.toLowerCase() ?? "";
  const generico = !tipo || tipo === "application/octet-stream" || tipo.startsWith("font/") || tipo.startsWith("application/x-font") || tipo === "application/illustrator";
  return generico ? (POR_EXTENSAO[extensao] ?? null) : null;
}

export const esquemaSolicitacaoReferencia = z.object({
  contaId: z.string().uuid(),
  categoria: z.enum(["LOGO", "LOGO_NEGATIVO", "SIMBOLO", "LOGO_ARQUIVO_FONTE", "FONTE", "ARTE", "PROVA"]),
  tipoMime: z.string().max(100),
  tamanhoBytes: z.number().int().positive("Arquivo vazio."),
  nomeOriginal: z.string().trim().min(1).max(255),
  licencaFonte: z.boolean().optional(),
});

export type ResultadoSolicitacaoReferencia =
  | { ok: true; midiaId: string; referenciaId: string; url: string; tipoMime: string }
  | { ok: false; erro: string };

/** Artes que contam no limite: disponíveis não removidas + pendentes da última hora. */
export async function contarArtes(contaId: string, db: ClienteDb = obterDb(), agora = new Date()) {
  return db.referencia.count({
    where: {
      contaId,
      categoria: "ARTE",
      removidaEm: null,
      OR: [
        { midia: { status: "DISPONIVEL" } },
        { midia: { status: "PENDENTE", criadoEm: { gt: new Date(agora.getTime() - PRAZO_PENDENTE_CONTA_MS) } } },
      ],
    },
  });
}

export async function solicitarUploadReferencia(
  entrada: unknown,
  db: PrismaClient = obterDb(),
): Promise<ResultadoSolicitacaoReferencia> {
  const r = esquemaSolicitacaoReferencia.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? "Dados inválidos." };
  const d = r.data;
  const tipo = tipoDeclarado(d.tipoMime, d.nomeOriginal);
  if (!tipo || !TIPOS_REFERENCIA[d.categoria].includes(tipo)) {
    return { ok: false, erro: "Tipo de arquivo não aceito aqui." };
  }
  if (d.tamanhoBytes > TAMANHO_MAX_REFERENCIA) return { ok: false, erro: "Arquivo grande demais (máximo 15 MB)." };
  if (d.categoria === "FONTE" && !d.licencaFonte) {
    return { ok: false, erro: "Marque que você tem licença para usar esta fonte no digital e nas redes sociais." };
  }
  if (d.categoria === "ARTE" && (await contarArtes(d.contaId, db)) >= MAX_ARTES) {
    return { ok: false, erro: `Você já enviou ${MAX_ARTES} artes. Remova uma para enviar outra.` };
  }
  const chave = `contas/${d.contaId}/referencias/${randomUUID()}.${EXTENSAO[tipo]}`;
  const { midia, referencia } = await db.$transaction(async (tx) => {
    const midia = await tx.midia.create({
      data: {
        contaId: d.contaId,
        origem: "UPLOAD",
        status: "PENDENTE",
        privada: true,
        chave,
        tipoMime: tipo,
        tamanhoBytes: BigInt(d.tamanhoBytes),
        nomeOriginal: d.nomeOriginal,
      },
    });
    const referencia = await tx.referencia.create({
      data: { contaId: d.contaId, midiaId: midia.id, categoria: d.categoria, licencaFonteDeclarada: !!d.licencaFonte },
    });
    return { midia, referencia };
  });
  const url = await gerarUrlUpload({ chave, tipoMime: tipo, tamanhoBytes: d.tamanhoBytes, area: "privada" });
  return { ok: true, midiaId: midia.id, referenciaId: referencia.id, url, tipoMime: tipo };
}

export type ResultadoConfirmacaoReferencia = { ok: true; avisos: string[] } | { ok: false; erro: string };

async function rejeitar(midia: Midia, erro: string, db: ClienteDb, motivo: string, apagar = true): Promise<ResultadoConfirmacaoReferencia> {
  if (apagar) await removerObjeto(midia.chave, "privada");
  await db.midia.updateMany({ where: { id: midia.id, status: "PENDENTE" }, data: { status: "REJEITADA" } });
  log.warn("referência rejeitada", { midiaId: midia.id, motivo });
  return { ok: false, erro };
}

/**
 * Confirmação depois do PUT (síncrona). Só age em mídia PENDENTE privada da conta.
 */
export async function confirmarUploadReferencia(
  contaId: string,
  midiaId: string,
  db: ClienteDb = obterDb(),
): Promise<ResultadoConfirmacaoReferencia> {
  const midia = await db.midia.findUnique({ where: { id: midiaId }, include: { referencia: true } });
  if (!midia || midia.status !== "PENDENTE" || !midia.privada || !midia.referencia || midia.referencia.contaId !== contaId) {
    return { ok: false, erro: "Envio não encontrado ou já confirmado." };
  }
  const referencia = midia.referencia;

  const objeto = await verificarObjeto(midia.chave, "privada");
  if (!objeto) return rejeitar(midia, "Arquivo não encontrado no armazenamento.", db, "inexistente", false);
  if (BigInt(objeto.tamanhoBytes) !== midia.tamanhoBytes || objeto.tipoMime !== midia.tipoMime) {
    return rejeitar(midia, "O arquivo enviado não confere com o informado.", db, "tamanho_ou_tipo");
  }
  const corpo = await lerObjeto(midia.chave, "privada", TAMANHO_MAX_REFERENCIA);
  if (!corpo) return rejeitar(midia, "Arquivo não encontrado no armazenamento.", db, "inexistente", false);

  const real = detectarTipoReal(corpo);
  if (!real || !tiposCompativeis(midia.tipoMime, real) || !TIPOS_REFERENCIA[referencia.categoria].includes(real)) {
    return rejeitar(midia, "O conteúdo do arquivo não confere com o tipo dele. Exporte de novo e tente outra vez.", db, "magic_bytes");
  }

  const sha256 = createHash("sha256").update(corpo).digest("hex");
  const duplicada = await db.referencia.findFirst({
    where: { contaId, removidaEm: null, id: { not: referencia.id }, midia: { sha256, status: "DISPONIVEL" } },
    select: { id: true },
  });
  if (duplicada) return rejeitar(midia, "Este arquivo já foi enviado para esta conta.", db, "duplicada");

  let categoria = referencia.categoria;
  if (CATEGORIAS_LOGO.includes(categoria) && (real === "application/pdf" || real === "application/postscript")) {
    categoria = "LOGO_ARQUIVO_FONTE";
  }
  const avisos: string[] = [];
  let dimensoes: { largura: number; altura: number; temAlfa: boolean } | null = null;
  let miniatura: Buffer | null = null;
  let tamanhoFinal = midia.tamanhoBytes;

  try {
    if (real === "image/svg+xml") {
      const limpo = sanitizarSvg(corpo.toString("utf8"));
      if (!limpo.ok) return rejeitar(midia, limpo.erro, db, "svg");
      const svg = Buffer.from(limpo.svg, "utf8");
      if (limpo.mudou) {
        await gravarObjeto(midia.chave, svg, "image/svg+xml", "privada");
        tamanhoFinal = BigInt(svg.byteLength);
        avisos.push("Removemos partes do SVG que não são seguras (scripts ou links externos). Confira se o desenho continua certo.");
      }
      const info = await inspecionarImagem(svg);
      dimensoes = { largura: info.largura, altura: info.altura, temAlfa: true };
      miniatura = await gerarMiniatura(svg);
    } else if (real === "image/jpeg" || real === "image/png" || real === "image/webp") {
      dimensoes = await inspecionarImagem(corpo);
      if (categoria === "ARTE" && dimensoes.largura < LARGURA_MIN_ARTE) {
        return rejeitar(midia, `A arte precisa ter pelo menos ${LARGURA_MIN_ARTE} px de largura (esta tem ${dimensoes.largura} px).`, db, "arte_pequena");
      }
      if (CATEGORIAS_LOGO.includes(categoria)) {
        if (Math.max(dimensoes.largura, dimensoes.altura) < LADO_MIN_LOGO) {
          return rejeitar(midia, `O logo precisa ter pelo menos ${LADO_MIN_LOGO} px no maior lado. Envie uma versão maior ou em SVG.`, db, "logo_pequeno");
        }
        if (real === "image/jpeg") avisos.push("Logo em JPG não tem fundo transparente. Se tiver em PNG transparente ou SVG, prefira.");
        else if (!dimensoes.temAlfa) avisos.push("Este logo não tem fundo transparente. Se tiver uma versão transparente, prefira.");
      }
      miniatura = await gerarMiniatura(corpo);
    }
  } catch (erro) {
    if (erro instanceof ErroImagem) return rejeitar(midia, erro.message, db, "imagem");
    throw erro;
  }

  const miniaturaChave = miniatura ? `${midia.chave}.mini.webp` : null;
  if (miniatura && miniaturaChave) await gravarObjeto(miniaturaChave, miniatura, "image/webp", "privada");

  const { count } = await db.midia.updateMany({
    where: { id: midia.id, status: "PENDENTE" },
    data: {
      status: "DISPONIVEL",
      sha256,
      tamanhoBytes: tamanhoFinal,
      largura: dimensoes?.largura ?? null,
      altura: dimensoes?.altura ?? null,
      temAlfa: dimensoes?.temAlfa ?? null,
      miniaturaChave,
      confirmadoEm: new Date(),
    },
  });
  if (count === 0) return { ok: false, erro: "Envio não encontrado ou já confirmado." };
  await db.referencia.update({ where: { id: referencia.id }, data: { categoria, avisos } });
  return { ok: true, avisos };
}

/** URL de leitura curta (5 min) do bucket privado; em dev sem R2, a rota local. */
export async function urlLeituraPrivada(chave: string, opcoes: { nomeDownload?: string; tipoMime?: string } = {}) {
  if (armazenamentoLocalAtivo()) return urlLocal(chave, opcoes.nomeDownload);
  return gerarUrlLeitura(chave, { area: "privada", ...opcoes });
}

export const GOSTA = {
  CORES: "Cores",
  TIPOGRAFIA: "Letras",
  LAYOUT: "Organização",
  FOTO: "Foto",
  QUANTIDADE_TEXTO: "Quantidade de texto",
  CLIMA: "Clima",
} as const;

export const esquemaMetadadosArte = z
  .object({
    origem: z.enum(["PROPRIA", "TERCEIROS"]).nullish(),
    gosta: z.array(z.enum(Object.keys(GOSTA) as [keyof typeof GOSTA, ...(keyof typeof GOSTA)[]])).max(6).default([]),
    gostaLivre: z.string().trim().max(200).nullish(),
    naoGosta: z.string().trim().max(200).nullish(),
    formato: z.enum(["POST", "CARROSSEL", "STORIES", "CAPA_REELS"]).nullish(),
    peso: z.enum(["EXATO", "SO_A_IDEIA"]).nullish(),
    direitoDeclarado: z.boolean().default(false),
  })
  .strict();

/** Metadados de uma referência. Arte: origem obrigatória; própria exige declarar o direito de uso. */
export async function salvarMetadadosReferencia(
  contaId: string,
  referenciaId: string,
  entrada: unknown,
  db: ClienteDb = obterDb(),
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const r = esquemaMetadadosArte.safeParse(entrada);
  if (!r.success) return { ok: false, erro: r.error.issues[0]?.message ?? "Dados inválidos." };
  const ref = await db.referencia.findUnique({ where: { id: referenciaId } });
  if (!ref || ref.contaId !== contaId || ref.removidaEm) return { ok: false, erro: "Referência não encontrada." };
  const d = r.data;
  if (ref.categoria === "ARTE") {
    if (!d.origem) return { ok: false, erro: "Diga se a arte é da sua marca ou uma inspiração de outra marca." };
    if (d.origem === "PROPRIA" && !d.direitoDeclarado) {
      return { ok: false, erro: "Confirme que você tem direito de usar esta imagem." };
    }
    await db.referencia.update({
      where: { id: ref.id },
      data: {
        origem: d.origem,
        gosta: d.gosta,
        gostaLivre: d.gostaLivre ?? null,
        naoGosta: d.naoGosta ?? null,
        formato: d.formato ?? null,
        peso: d.peso ?? null,
        direitoDeclarado: d.origem === "PROPRIA" ? d.direitoDeclarado : false,
      },
    });
  } else {
    await db.referencia.update({ where: { id: ref.id }, data: { direitoDeclarado: d.direitoDeclarado } });
  }
  return { ok: true };
}

/** Remover = esconder (os arquivos ficam; a versão concluída do conjunto continua igual). */
export async function removerReferencia(contaId: string, referenciaId: string, db: ClienteDb = obterDb()) {
  const { count } = await db.referencia.updateMany({
    where: { id: referenciaId, contaId, removidaEm: null },
    data: { removidaEm: new Date() },
  });
  return count > 0;
}

export type ReferenciaComMidia = Referencia & { midia: Midia };

export async function listarReferencias(contaId: string, db: ClienteDb = obterDb()): Promise<ReferenciaComMidia[]> {
  return db.referencia.findMany({
    where: { contaId, removidaEm: null, midia: { status: "DISPONIVEL" } },
    include: { midia: true },
    orderBy: { criadoEm: "asc" },
  });
}

/** O que impede concluir a etapa 5 (vazio = pode concluir). */
export function bloqueiosReferencias(refs: ReferenciaComMidia[]): string[] {
  const bloqueios: string[] = [];
  if (!refs.some((r) => r.categoria === "LOGO")) bloqueios.push("Envie o logo principal.");
  const artes = refs.filter((r) => r.categoria === "ARTE");
  if (artes.length < MIN_ARTES) bloqueios.push(`Envie mais ${MIN_ARTES - artes.length} ${MIN_ARTES - artes.length === 1 ? "arte" : "artes"} para continuar.`);
  const semOrigem = artes.filter((a) => !a.origem).length;
  if (semOrigem > 0) bloqueios.push(`Diga de onde vem ${semOrigem === 1 ? "1 arte" : `${semOrigem} artes`} (sua marca ou inspiração).`);
  return bloqueios;
}

/** Avisos (não bloqueiam): formatos e só inspirações de terceiros. */
export function avisosReferencias(refs: ReferenciaComMidia[]): string[] {
  const artes = refs.filter((r) => r.categoria === "ARTE");
  if (artes.length === 0) return [];
  const avisos: string[] = [];
  const vertical = artes.some((a) => a.formato === "STORIES" || a.formato === "CAPA_REELS" || (a.midia.altura ?? 0) > (a.midia.largura ?? 0) * 1.5);
  const feed = artes.some((a) => a.formato === "POST" || a.formato === "CARROSSEL" || ((a.midia.altura ?? 0) <= (a.midia.largura ?? 0) * 1.5 && !!a.midia.largura));
  if (!vertical) avisos.push("Nenhuma arte vertical (stories ou capa de reels). Se tiver, envie uma.");
  if (!feed) avisos.push("Nenhuma arte de feed (post ou carrossel). Se tiver, envie uma.");
  if (artes.every((a) => a.origem === "TERCEIROS")) {
    avisos.push("Só há inspirações de outras marcas. Com artes da sua própria marca, o resultado fica mais a sua cara.");
  }
  return avisos;
}

/** Conclui a etapa 5: grava uma nova versão do conjunto de referências. */
export async function concluirReferencias(
  contaId: string,
  db: PrismaClient = obterDb(),
): Promise<{ ok: true; versao: number; avisos: string[] } | { ok: false; erro: string }> {
  const refs = await listarReferencias(contaId, db);
  const bloqueios = bloqueiosReferencias(refs);
  if (bloqueios.length > 0) return { ok: false, erro: bloqueios.join(" ") };
  const marca = await db.marca.findUnique({ where: { contaId } });
  const briefing = lerBriefingMarca(marca?.briefing);
  const versao = await db.$transaction(async (tx) => {
    const ultimo = await tx.conjuntoReferencias.aggregate({ where: { contaId }, _max: { versao: true } });
    const versao = (ultimo._max.versao ?? 0) + 1;
    await tx.conjuntoReferencias.create({
      data: {
        contaId,
        versao,
        itens: refs.map((r) => ({
          referenciaId: r.id,
          midiaId: r.midiaId,
          categoria: r.categoria,
          origem: r.origem,
          gosta: r.gosta,
          gostaLivre: r.gostaLivre,
          naoGosta: r.naoGosta,
          formato: r.formato,
          peso: r.peso,
          direitoDeclarado: r.direitoDeclarado,
        })),
        cores: briefing.cores ?? [],
        fontes: briefing.fontes ?? [],
        links: briefing.links ?? [],
      },
    });
    await tx.marca.upsert({
      where: { contaId },
      update: { referenciasConcluidasEm: new Date() },
      create: { contaId, referenciasConcluidasEm: new Date() },
    });
    return versao;
  });
  return { ok: true, versao, avisos: avisosReferencias(refs) };
}
