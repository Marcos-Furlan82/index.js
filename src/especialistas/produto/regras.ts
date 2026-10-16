import type { BriefingMarca } from "@/briefing/esquemas";
import { pendenciasDoBriefing, type ContextoBriefing } from "@/briefing/obrigatorios";
import type { Nicho, Objetivo } from "@/briefing/opcoes";
import { LIMITE_DIFERENCIAL } from "@/briefing/esquemas";
import {
  BLOCOS_FICHA,
  blocoDoCampo,
  type AcaoCta,
  type CampoFicha,
  type ChaveBloco,
  type Ficha,
  type Pendencia,
  type SaidaIA,
} from "./esquema";

/**
 * Regras determinísticas da ficha (sem IA). Valem para toda versão, inclusive
 * as editadas à mão: as pendências "bloqueia" só nascem daqui.
 */

export const ABSOLUTOS = ['Usar "100%", "garantido" ou "definitivo" sem prova'];

export const REGRAS_NICHO: Record<Nicho, string[]> = {
  TERAPIA_SAUDE: [
    "Prometer cura",
    "Garantir resultado de tratamento",
    "Mostrar antes e depois de pacientes",
    "Dizer que substitui consulta com profissional",
  ],
  CURSO: ["Garantir renda, faturamento ou emprego", "Prometer resultado rápido sem esforço"],
  MENTORIA: ["Garantir renda, faturamento ou emprego", "Prometer resultado rápido sem esforço"],
  PRODUTO_DIGITAL: ["Prometer resultado garantido"],
  SAAS: ["Prometer resultado garantido"],
  PRODUTO_FISICO: ["Fazer alegação de saúde ou eficácia sem comprovação"],
  SERVICO_LOCAL: ["Prometer prazo ou preço que não foram combinados"],
  OUTRO: ["Prometer resultado garantido"],
};

const TERMOS_ABSOLUTOS = ["100%", "100 %", "garantido", "garantida", "garantidos", "garantidas", "definitivo", "definitiva"];

export function normalizarTexto(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function escaparRegex(t: string) {
  return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Palavras da lista que aparecem no texto (sem diferenciar maiúsculas e acentos, palavra inteira). */
export function acharPalavrasProibidas(texto: string, palavras: string[]): string[] {
  const alvo = normalizarTexto(texto);
  return palavras.filter((p) => {
    const n = normalizarTexto(p.trim());
    if (!n) return false;
    const inicio = /^[\p{L}\p{N}]/u.test(n) ? "(?<![\\p{L}\\p{N}])" : "";
    const fim = /[\p{L}\p{N}]$/u.test(n) ? "(?![\\p{L}\\p{N}])" : "";
    return new RegExp(`${inicio}${escaparRegex(n)}${fim}`, "u").test(alvo);
  });
}

/** CTA esperado pelo objetivo de 90 dias e pela isca. */
export function ctaEsperado(objetivo: Objetivo | null | undefined, escolhaIsca: string | null | undefined): AcaoCta | null {
  switch (objetivo) {
    case "VENDAS":
      return "comprar";
    case "AGENDA":
      return "agendar";
    case "LEADS":
      return escolhaIsca === "SEM_ISCA" || !escolhaIsca ? "chamar_dm" : "baixar_isca";
    case "SEGUIDORES":
      return "seguir";
    default:
      return null;
  }
}

/**
 * Textos da ficha por campo (onde procurar palavras proibidas e absolutos).
 * Ficam de fora "não pode prometer" e as regras do setor, que citam esses termos de propósito.
 */
export function textosPorCampo(f: Ficha): { campo: CampoFicha; texto: string }[] {
  return [
    { campo: "promessaCentral", texto: f.promessaCentral },
    { campo: "oferta", texto: [f.oferta.preco, f.oferta.formaCompra, f.oferta.condicoes].join(" \n ") },
    { campo: "persona", texto: [f.persona.nomeFicticio, f.persona.perfil, ...f.persona.dores, ...f.persona.desejos, ...f.persona.gatilhosCompra].join(" \n ") },
    { campo: "diferencial", texto: f.diferencial },
    { campo: "diferenciaisSecundarios", texto: f.diferenciaisSecundarios.join(" \n ") },
    { campo: "objecoes", texto: f.objecoes.map((o) => `${o.objecao} \n ${o.resposta}`).join(" \n ") },
    { campo: "podePrometer", texto: f.podePrometer.join(" \n ") },
    { campo: "ctaPrincipal", texto: `${f.ctaPrincipal.texto} \n ${f.ctaPrincipal.destino}` },
  ];
}

/** O que as regras precisam saber do briefing atual. */
export type ContextoRegras = {
  nicho: Nicho;
  objetivo90d: Objetivo | null;
  escolhaIsca: string | null;
  palavrasProibidas: string[];
  provasSemAutorizacao: number;
  pendenciasBriefing: { campo: string; pergunta: string }[];
};

export function contextoRegras(ctx: ContextoBriefing): ContextoRegras {
  const marca: BriefingMarca = ctx.marca;
  return {
    nicho: (marca.nicho ?? "OUTRO") as Nicho,
    objetivo90d: (marca.objetivo90d ?? null) as Objetivo | null,
    escolhaIsca: ctx.isca?.escolha ?? null,
    palavrasProibidas: marca.palavrasProibidas ?? [],
    provasSemAutorizacao: (ctx.produto.briefing.provas ?? []).filter((p) => !p.autorizadoUso).length,
    pendenciasBriefing: pendenciasDoBriefing(ctx),
  };
}

export function chavePendencia(p: Pick<Pendencia, "campo" | "pergunta">) {
  return `${p.campo}:${p.pergunta}`;
}

function semRepetidas(lista: Pendencia[]): Pendencia[] {
  const vistas = new Set<string>();
  return lista.filter((p) => {
    const k = chavePendencia(p);
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/** Pendências calculadas pelo código a cada versão (únicas que podem bloquear). */
export function pendenciasDeterministicas(f: Ficha, rc: ContextoRegras): Pendencia[] {
  const saida: Pendencia[] = [];
  const add = (campo: CampoFicha, pergunta: string, criticidade: Pendencia["criticidade"]) =>
    saida.push({ campo, pergunta, criticidade, origem: "regra" });

  if (!f.oferta.preco.trim()) add("oferta", "Qual é o preço do produto?", "bloqueia");
  if (!f.oferta.formaCompra.trim()) add("oferta", "Como a pessoa compra (site, WhatsApp, link de pagamento...)?", "bloqueia");

  for (const { campo, texto } of textosPorCampo(f)) {
    for (const palavra of acharPalavrasProibidas(texto, rc.palavrasProibidas)) {
      add(campo, `Tirar a palavra proibida "${palavra}".`, "bloqueia");
    }
    for (const termo of acharPalavrasProibidas(texto, TERMOS_ABSOLUTOS)) {
      add(campo, `Tirar "${termo}": só pode ser usado com prova.`, "bloqueia");
    }
  }

  const esperado = ctaEsperado(rc.objetivo90d, rc.escolhaIsca);
  if (esperado && f.ctaPrincipal.acao !== esperado) {
    add("ctaPrincipal", "O convite do post não combina com o objetivo de 90 dias. Confira a ação pedida.", "melhora");
  }
  if (f.provas.length === 0) {
    add("provas", "Você tem provas (depoimentos, números, casos)? Sem elas, os posts convencem menos.", "melhora");
  }
  if (rc.provasSemAutorizacao > 0) {
    add(
      "provas",
      `${rc.provasSemAutorizacao} ${rc.provasSemAutorizacao === 1 ? "prova sem autorização ficou" : "provas sem autorização ficaram"} de fora da ficha.`,
      "melhora",
    );
  }
  if (f.promessaCentral.length > 140) add("promessaCentral", "Encurte a promessa para até 140 caracteres.", "melhora");
  if (f.diferencial.length > LIMITE_DIFERENCIAL) add("diferencial", "Encurte o diferencial para até 140 caracteres.", "melhora");
  for (const p of rc.pendenciasBriefing) add(p.campo as CampoFicha, p.pergunta, "melhora");
  return semRepetidas(saida);
}

/** Troca as pendências de regra pelas recalculadas; mantém as da IA. */
export function recalcularPendencias(f: Ficha, rc: ContextoRegras): Ficha {
  const daIA = f.pendencias.filter((p) => p.origem === "ia");
  return { ...f, pendencias: semRepetidas([...pendenciasDeterministicas(f, rc), ...daIA]) };
}

function semDuplicar(lista: string[]): string[] {
  const vistas = new Set<string>();
  return lista.filter((x) => {
    const k = normalizarTexto(x.trim());
    if (!k || vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
}

/**
 * Da saída da IA para a ficha guardada: provas copiadas do briefing (só as
 * autorizadas), referência a prova inexistente vira null, regras do setor e
 * palavras proibidas sempre presentes, campos do sistema preenchidos pelo código.
 */
export function posProcessarFicha(saida: SaidaIA, ctx: ContextoBriefing, iscaId: string | null): Ficha {
  const rc = contextoRegras(ctx);
  const provas = (ctx.produto.briefing.provas ?? [])
    .filter((p) => p.autorizadoUso && p.conteudo.trim())
    .map((p) => ({ id: p.id, tipo: p.tipo, texto: p.conteudo, fonte: p.fonte ?? "", autorizada: true as const, origem: "gestor" as const }));
  const idsProvas = new Set(provas.map((p) => p.id));
  const ficha: Ficha = {
    promessaCentral: saida.promessaCentral.trim(),
    oferta: saida.oferta,
    persona: saida.persona,
    diferencial: saida.diferencial.trim(),
    diferenciaisSecundarios: semDuplicar(saida.diferenciaisSecundarios),
    provas,
    objecoes: saida.objecoes.map((o) => ({ ...o, provaRef: o.provaRef && idsProvas.has(o.provaRef) ? o.provaRef : null })),
    podePrometer: semDuplicar(saida.podePrometer),
    naoPodePrometer: semDuplicar([...saida.naoPodePrometer, ...REGRAS_NICHO[rc.nicho], ...ABSOLUTOS]),
    compliance: {
      orgao: saida.compliance.orgao?.trim() || null,
      regras: semDuplicar(saida.compliance.regras),
      termosProibidos: semDuplicar([...saida.compliance.termosProibidos, ...rc.palavrasProibidas]),
    },
    ctaPrincipal: saida.ctaPrincipal,
    iscaId,
    principal: ctx.principal,
    nicho: rc.nicho,
    pendencias: saida.pendencias.map((p) => ({ ...p, criticidade: "melhora" as const, origem: "ia" as const })),
    confianca: saida.confianca,
  };
  return recalcularPendencias(ficha, rc);
}

/** Blocos com algum campo marcado como "inferido" (precisam ser revisados antes de aprovar). */
export function blocosComInferido(f: Ficha): ChaveBloco[] {
  const blocos = new Set<ChaveBloco>();
  for (const c of f.confianca) if (c.nivel === "inferido") blocos.add(blocoDoCampo(c.campo));
  return BLOCOS_FICHA.map((b) => b.chave).filter((b) => blocos.has(b));
}

/** O que impede a aprovação (vazio = pode aprovar). Pendências "melhora" nunca bloqueiam. */
export function bloqueiosAprovacao(f: Ficha, blocosRevisados: string[]): string[] {
  const motivos = f.pendencias.filter((p) => p.criticidade === "bloqueia").map((p) => p.pergunta);
  for (const bloco of blocosComInferido(f)) {
    if (!blocosRevisados.includes(bloco)) {
      const titulo = BLOCOS_FICHA.find((b) => b.chave === bloco)!.titulo;
      motivos.push(`Marque "Revisei este bloco" em ${titulo}.`);
    }
  }
  return motivos;
}
