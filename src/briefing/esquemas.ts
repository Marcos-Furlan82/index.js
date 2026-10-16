import { z } from "zod";
import { urlHttp } from "@/lib/url";
import {
  CANAIS,
  ENTREGAS_ISCA,
  ESCOLHAS_ISCA,
  FORMAS_COMPRA,
  FORMATOS_ISCA,
  MARCA_CONHECIDA,
  NICHOS,
  OBJETIVOS,
  ORIGENS_FONTE,
  PAPEIS_COR,
  QUEM_APARECE,
  TIPOS_DATA,
  TIPOS_PROVA,
  TONS,
} from "./opcoes";

/**
 * Formato das respostas do briefing (JSON em Marca.briefing e Produto.briefing).
 * O "rascunho" aceita qualquer subconjunto (autosave campo a campo; null limpa).
 * O merge no banco é raso: listas e objetos são sempre enviados inteiros.
 */

export const LIMITE_CURTO = 200;
export const LIMITE_LONGO = 2000;
export const LIMITE_DIFERENCIAL = 140;

const curto = z.string().trim().max(LIMITE_CURTO, `Use no máximo ${LIMITE_CURTO} caracteres.`);
const longo = z.string().trim().max(LIMITE_LONGO, `Use no máximo ${LIMITE_LONGO} caracteres.`);
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");
const linkHttp = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || urlHttp(v) !== null, "Use um link completo, começando com https://");

function semRepetidos<T>(lista: T[], chave: (item: T) => string) {
  return new Set(lista.map(chave)).size === lista.length;
}

export const esquemaProva = z.object({
  id: z.string().uuid(),
  tipo: z.enum(TIPOS_PROVA.valores),
  conteudo: longo,
  fonte: curto.default(""),
  arquivoReferenciaId: z.string().uuid().nullish(),
  autorizadoUso: z.boolean().default(false),
});
export type Prova = z.infer<typeof esquemaProva>;

export const esquemaDataImportante = z.object({
  id: z.string().uuid(),
  data: dataIso,
  nome: z.string().trim().min(1, "Dê um nome à data.").max(120),
  tipo: z.enum(TIPOS_DATA.valores),
});

export const esquemaCor = z.object({
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use o formato #RRGGBB."),
  papel: z.enum(PAPEIS_COR.valores),
});

export const esquemaFonte = z.object({
  id: z.string().uuid(),
  familia: z.string().trim().min(1, "Informe o nome da fonte.").max(100),
  origem: z.enum(ORIGENS_FONTE.valores),
  referenciaId: z.string().uuid().nullish(),
});

/** Perguntas 1, 3, 4 e 5 (por produto). O nome do produto fica na coluna Produto.nome. */
const camposProduto = {
  descricao: longo,
  preco: curto,
  formaCompra: z.enum(FORMAS_COMPRA.valores),
  perfil: curto,
  dor: longo,
  desejo: longo,
  objecaoPrincipal: longo,
  diferencial: z.string().trim().max(LIMITE_DIFERENCIAL, `Use no máximo ${LIMITE_DIFERENCIAL} caracteres.`),
  provas: z
    .array(esquemaProva)
    .max(20, "Use no máximo 20 provas.")
    .refine((l) => semRepetidos(l, (p) => p.id), "Provas repetidas."),
};

/** Perguntas 2, 6, 7, 8, 10, 11, 12 + identidade visual (por conta). */
const camposMarca = {
  nicho: z.enum(NICHOS.valores),
  nichoDescricao: curto,
  seguidores: z.number().int().min(0).max(1_000_000_000),
  ultimoPost: dataIso,
  postaHoje: z.boolean(),
  marcaConhecida: z.enum(MARCA_CONHECIDA.valores),
  canaisExistentes: z.array(z.enum(CANAIS.valores)).max(CANAIS.valores.length),
  objetivo90d: z.enum(OBJETIVOS.valores),
  metaNumerica: z.number().int().min(0).max(1_000_000_000),
  postsSemana: z.number().int().min(1, "Mínimo de 1 por semana.").max(14, "Máximo de 14 por semana."),
  quemAparece: z.array(z.enum(QUEM_APARECE.valores)).max(QUEM_APARECE.valores.length),
  gravaVideo: z.boolean(),
  tomVoz: z.array(z.enum(TONS.valores)).max(TONS.valores.length),
  palavrasProibidas: z.array(z.string().trim().min(1).max(60)).max(50, "Use no máximo 50 palavras."),
  restricoesLegais: longo,
  datas: z
    .array(esquemaDataImportante)
    .max(30, "Use no máximo 30 datas.")
    .refine((l) => semRepetidos(l, (d) => d.id), "Datas repetidas."),
  cores: z.array(esquemaCor).max(6, "Use no máximo 6 cores."),
  fontes: z
    .array(esquemaFonte)
    .max(5, "Use no máximo 5 fontes.")
    .refine((l) => semRepetidos(l, (f) => f.id), "Fontes repetidas."),
  links: z.array(linkHttp).max(3, "Use no máximo 3 links."),
  respondidoDepois: z.array(z.string().max(60)).max(40),
};

function rascunho<T extends Record<string, z.ZodType>>(campos: T) {
  const parciais = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, v.nullable().optional()])) as {
    [K in keyof T]: z.ZodOptional<z.ZodNullable<T[K]>>;
  };
  return z.object(parciais).strict();
}

export const esquemaRascunhoProduto = rascunho(camposProduto);
export const esquemaRascunhoMarca = rascunho(camposMarca);

export type BriefingProduto = z.infer<typeof esquemaRascunhoProduto>;
export type BriefingMarca = z.infer<typeof esquemaRascunhoMarca>;

export const CAMPOS_PRODUTO = Object.keys(camposProduto) as (keyof typeof camposProduto)[];
export const CAMPOS_MARCA = Object.keys(camposMarca) as (keyof typeof camposMarca)[];

/** Lê o JSON do banco tolerando lixo: campos inválidos são ignorados. */
export function lerBriefingProduto(json: unknown): BriefingProduto {
  return lerTolerante(json, esquemaRascunhoProduto.shape) as BriefingProduto;
}

export function lerBriefingMarca(json: unknown): BriefingMarca {
  return lerTolerante(json, esquemaRascunhoMarca.shape) as BriefingMarca;
}

function lerTolerante(json: unknown, shape: Record<string, z.ZodType>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  if (!json || typeof json !== "object" || Array.isArray(json)) return saida;
  for (const [chave, valor] of Object.entries(json)) {
    const esquema = shape[chave];
    if (!esquema || valor === null || valor === undefined) continue;
    const r = esquema.safeParse(valor);
    if (r.success && r.data !== null && r.data !== undefined) saida[chave] = r.data;
  }
  return saida;
}

export const esquemaIsca = z
  .object({
    escolha: z.enum(ESCOLHAS_ISCA.valores),
    descricao: curto.nullish(),
    formato: z.enum(FORMATOS_ISCA.valores).nullish(),
    comoRecebe: z.enum(ENTREGAS_ISCA.valores).nullish(),
    link: linkHttp.nullish(),
    pronta: z.boolean().default(false),
    previsaoPronta: dataIso.nullish(),
    sugestaoChave: z.string().max(60).nullish(),
  })
  .strict();
export type DadosIsca = z.infer<typeof esquemaIsca>;

/** Etapa de cada pergunta (para links "falta responder" e para a barra de etapas). */
export const ETAPA_DO_CAMPO: Record<string, number> = {
  nome: 1,
  descricao: 1,
  preco: 1,
  formaCompra: 1,
  nicho: 1,
  nichoDescricao: 1,
  diferencial: 1,
  perfil: 2,
  dor: 2,
  desejo: 2,
  objecaoPrincipal: 2,
  provas: 2,
  seguidores: 3,
  ultimoPost: 3,
  postaHoje: 3,
  marcaConhecida: 3,
  canaisExistentes: 3,
  objetivo90d: 3,
  metaNumerica: 3,
  datas: 3,
  isca: 4,
  postsSemana: 4,
  quemAparece: 4,
  gravaVideo: 4,
  tomVoz: 4,
  palavrasProibidas: 4,
  restricoesLegais: 4,
  cores: 5,
  fontes: 5,
  links: 5,
};
