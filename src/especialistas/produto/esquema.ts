import { z } from "zod";

/**
 * Ficha do produto. Duas formas:
 * - esquemaSaidaIA: o que a IA devolve (saída estruturada). Sem limites de
 *   tamanho, sem "record" e com todos os objetos fechados (exigência do JSON
 *   Schema de saída). A IA só emite pendências "melhora".
 * - esquemaFicha: a ficha guardada = saída + campos que o CÓDIGO preenche
 *   (provas copiadas do briefing, isca, principal, nicho, origem das pendências).
 */

export const CAMPOS_FICHA = [
  "promessaCentral",
  "oferta",
  "persona",
  "diferencial",
  "diferenciaisSecundarios",
  "provas",
  "objecoes",
  "podePrometer",
  "naoPodePrometer",
  "compliance",
  "ctaPrincipal",
  "isca",
] as const;
export type CampoFicha = (typeof CAMPOS_FICHA)[number];

export const ACOES_CTA = ["comprar", "agendar", "baixar_isca", "chamar_dm", "seguir"] as const;
export type AcaoCta = (typeof ACOES_CTA)[number];

export const ROTULOS_ACAO_CTA: Record<AcaoCta, string> = {
  comprar: "Comprar",
  agendar: "Agendar um horário",
  baixar_isca: "Pegar o material gratuito",
  chamar_dm: "Chamar por mensagem",
  seguir: "Seguir o perfil",
};

export const NIVEIS_CONSCIENCIA = ["inconsciente", "problema", "solucao", "produto"] as const;
export const ROTULOS_NIVEL: Record<(typeof NIVEIS_CONSCIENCIA)[number], string> = {
  inconsciente: "Ainda não percebeu o problema",
  problema: "Sabe do problema, não conhece soluções",
  solucao: "Conhece soluções, não conhece você",
  produto: "Já conhece o seu produto",
};

/** Blocos da tela de revisão (sem jargão) e os campos de cada um. */
export const BLOCOS_FICHA = [
  { chave: "promessa", titulo: "Promessa", campos: ["promessaCentral"] },
  { chave: "oferta", titulo: "Oferta", campos: ["oferta"] },
  { chave: "quemCompra", titulo: "Quem compra", campos: ["persona"] },
  { chave: "diferenciais", titulo: "Diferenciais", campos: ["diferencial", "diferenciaisSecundarios"] },
  { chave: "provas", titulo: "Provas", campos: ["provas"] },
  { chave: "duvidas", titulo: "Dúvidas de quem compra e respostas", campos: ["objecoes"] },
  { chave: "prometer", titulo: "O que pode e o que não pode prometer", campos: ["podePrometer", "naoPodePrometer"] },
  { chave: "regras", titulo: "Regras do setor", campos: ["compliance"] },
  { chave: "acao", titulo: "O que a pessoa deve fazer", campos: ["ctaPrincipal", "isca"] },
] as const satisfies readonly { chave: string; titulo: string; campos: readonly CampoFicha[] }[];

export type ChaveBloco = (typeof BLOCOS_FICHA)[number]["chave"];
export const CHAVES_BLOCO = BLOCOS_FICHA.map((b) => b.chave) as [ChaveBloco, ...ChaveBloco[]];

export function blocoDoCampo(campo: CampoFicha): ChaveBloco {
  return BLOCOS_FICHA.find((b) => (b.campos as readonly string[]).includes(campo))!.chave;
}

const oferta = z.object({ preco: z.string(), formaCompra: z.string(), condicoes: z.string() });
const persona = z.object({
  nomeFicticio: z.string(),
  perfil: z.string(),
  dores: z.array(z.string()),
  desejos: z.array(z.string()),
  gatilhosCompra: z.array(z.string()),
  nivelConsciencia: z.enum(NIVEIS_CONSCIENCIA),
});
const objecao = z.object({ objecao: z.string(), resposta: z.string(), provaRef: z.string().nullable() });
const compliance = z.object({ orgao: z.string().nullable(), regras: z.array(z.string()), termosProibidos: z.array(z.string()) });
const cta = z.object({ acao: z.enum(ACOES_CTA), texto: z.string(), destino: z.string() });
const confianca = z.object({ campo: z.enum(CAMPOS_FICHA), nivel: z.enum(["informado", "inferido"]) });

export const esquemaSaidaIA = z.object({
  promessaCentral: z.string(),
  oferta,
  persona,
  diferencial: z.string(),
  diferenciaisSecundarios: z.array(z.string()),
  objecoes: z.array(objecao),
  podePrometer: z.array(z.string()),
  naoPodePrometer: z.array(z.string()),
  compliance,
  ctaPrincipal: cta,
  pendencias: z.array(z.object({ campo: z.enum(CAMPOS_FICHA), pergunta: z.string(), criticidade: z.enum(["melhora"]) })),
  confianca: z.array(confianca),
});
export type SaidaIA = z.infer<typeof esquemaSaidaIA>;

export const esquemaProvaFicha = z.object({
  id: z.string(),
  tipo: z.string(),
  texto: z.string(),
  fonte: z.string(),
  autorizada: z.literal(true),
  origem: z.literal("gestor"),
});

export const esquemaPendencia = z.object({
  campo: z.enum(CAMPOS_FICHA),
  pergunta: z.string().min(1).max(500),
  criticidade: z.enum(["bloqueia", "melhora"]),
  /** "ia": sugerida pela IA (só melhora). "regra": calculada pelo código a cada versão. */
  origem: z.enum(["ia", "regra"]),
});
export type Pendencia = z.infer<typeof esquemaPendencia>;

const texto = z.string().max(5000);
const lista = z.array(z.string().max(1000)).max(50);

export const esquemaFicha = z.object({
  promessaCentral: texto,
  oferta: z.object({ preco: texto, formaCompra: texto, condicoes: texto }),
  persona: z.object({
    nomeFicticio: z.string().max(200),
    perfil: texto,
    dores: lista,
    desejos: lista,
    gatilhosCompra: lista,
    nivelConsciencia: z.enum(NIVEIS_CONSCIENCIA),
  }),
  diferencial: texto,
  diferenciaisSecundarios: lista,
  provas: z.array(esquemaProvaFicha).max(50),
  objecoes: z.array(z.object({ objecao: texto, resposta: texto, provaRef: z.string().nullable() })).max(30),
  podePrometer: lista,
  naoPodePrometer: lista,
  compliance: z.object({ orgao: z.string().max(200).nullable(), regras: lista, termosProibidos: lista }),
  ctaPrincipal: z.object({ acao: z.enum(ACOES_CTA), texto: texto, destino: texto }),
  iscaId: z.string().nullable(),
  principal: z.boolean(),
  nicho: z.string(),
  pendencias: z.array(esquemaPendencia).max(100),
  confianca: z.array(confianca),
});
export type Ficha = z.infer<typeof esquemaFicha>;

/** Partes editáveis de cada bloco (validação da edição manual). */
export const esquemaEdicaoBloco = {
  promessa: esquemaFicha.pick({ promessaCentral: true }),
  oferta: esquemaFicha.pick({ oferta: true }),
  quemCompra: esquemaFicha.pick({ persona: true }),
  diferenciais: esquemaFicha.pick({ diferencial: true, diferenciaisSecundarios: true }),
  provas: z.object({}),
  duvidas: esquemaFicha.pick({ objecoes: true }),
  prometer: esquemaFicha.pick({ podePrometer: true, naoPodePrometer: true }),
  regras: esquemaFicha.pick({ compliance: true }),
  acao: z.object({ ctaPrincipal: esquemaFicha.shape.ctaPrincipal }),
} satisfies Record<ChaveBloco, z.ZodType>;
