import { Decimal, parseValorBR } from "@/lib/dinheiro";
import { ETAPA_DO_CAMPO, type BriefingMarca, type BriefingProduto, type DadosIsca } from "./esquemas";

/**
 * O que falta para GERAR a ficha do produto (perguntas críticas) e o que só
 * melhoraria a ficha (vira pendência "melhora"). Regra do briefing:
 * exigidos 1 (com preço e forma de compra), 2, 3 (dor e objeção concretas),
 * 4, 8, 9 e o tom de voz (11).
 */

export const NOME_PROVISORIO = "Produto principal";
const MINIMO_CONCRETO = 10;

/** "R$ 297", "297,00", "1.297,90" ou "297.90" → Decimal; senão null. */
export function lerPreco(texto: string | null | undefined): Decimal | null {
  const limpo = (texto ?? "").replace(/R\$/gi, "").replace(/\s+/g, "").trim();
  if (!limpo) return null;
  const br = parseValorBR(limpo, 2);
  if (br.ok) return br.valor.gt(0) ? br.valor : null;
  if (/^\d+\.\d{1,2}$/.test(limpo)) {
    const v = new Decimal(limpo);
    return v.gt(0) ? v : null;
  }
  return null;
}

export type ContextoBriefing = {
  contaId: string;
  produto: { id: string; nome: string; briefing: BriefingProduto };
  principal: boolean;
  marca: BriefingMarca;
  isca: (DadosIsca & { escolha: DadosIsca["escolha"] }) | null;
};

export type Faltante = { campo: string; rotulo: string; etapa: number; link: string };

const CAMPOS_DO_PRODUTO = new Set(["nome", "descricao", "preco", "formaCompra", "perfil", "dor", "desejo", "objecaoPrincipal", "diferencial", "provas", "isca"]);

/** Link para a pergunta: produto secundário tem página própria; o resto fica no assistente. */
export function linkDoCampo(ctx: Pick<ContextoBriefing, "contaId" | "principal" | "produto">, campo: string): string {
  if (!ctx.principal && CAMPOS_DO_PRODUTO.has(campo)) {
    return `/contas/${ctx.contaId}/produtos/${ctx.produto.id}#campo-${campo}`;
  }
  return `/contas/${ctx.contaId}/briefing?etapa=${ETAPA_DO_CAMPO[campo] ?? 1}#campo-${campo}`;
}

function concreto(texto: string | null | undefined) {
  return (texto ?? "").trim().length >= MINIMO_CONCRETO;
}

export function iscaCompleta(isca: ContextoBriefing["isca"]): boolean {
  if (!isca) return false;
  if (isca.escolha === "SEM_ISCA") return true;
  if (isca.escolha === "SUGESTAO") return !!isca.sugestaoChave;
  return !!isca.descricao?.trim() && !!isca.formato && !!isca.comoRecebe;
}

export function faltandoParaGerar(ctx: ContextoBriefing): Faltante[] {
  const p = ctx.produto.briefing;
  const m = ctx.marca;
  const itens: [boolean, string, string][] = [
    [!!ctx.produto.nome.trim() && ctx.produto.nome !== NOME_PROVISORIO, "nome", "Nome do produto"],
    [concreto(p.descricao), "descricao", "O que você vende (descrição)"],
    [lerPreco(p.preco) !== null, "preco", "Preço (em reais, por exemplo 297,00)"],
    [!!p.formaCompra, "formaCompra", "Como a pessoa compra"],
    [!!m.nicho && (m.nicho !== "OUTRO" || !!m.nichoDescricao?.trim()), "nicho", "Nicho"],
    [concreto(p.dor), "dor", "O que incomoda quem compra"],
    [concreto(p.objecaoPrincipal), "objecaoPrincipal", "O que faz a pessoa hesitar"],
    [!!p.diferencial?.trim(), "diferencial", "Por que você e não outro"],
    [!!m.objetivo90d, "objetivo90d", "O que você quer em 90 dias"],
    [iscaCompleta(ctx.isca), "isca", "Isca (material gratuito)"],
    [(m.tomVoz?.length ?? 0) > 0, "tomVoz", "Tom de voz"],
  ];
  return itens
    .filter(([ok]) => !ok)
    .map(([, campo, rotulo]) => ({ campo, rotulo, etapa: ETAPA_DO_CAMPO[campo] ?? 1, link: linkDoCampo(ctx, campo) }));
}

/** Pendências "melhora" que nascem do briefing (perguntas não críticas sem resposta). */
export function pendenciasDoBriefing(ctx: ContextoBriefing): { campo: string; pergunta: string }[] {
  const p = ctx.produto.briefing;
  const m = ctx.marca;
  const saida: { campo: string; pergunta: string }[] = [];
  if (!p.perfil?.trim()) saida.push({ campo: "persona", pergunta: "Quem compra de você (idade, momento de vida)?" });
  if (!p.desejo?.trim()) saida.push({ campo: "persona", pergunta: "O que quem compra quer conseguir?" });
  if (m.nicho === "TERAPIA_SAUDE" && !m.restricoesLegais?.trim()) {
    saida.push({ campo: "compliance", pergunta: "Quais regras do seu conselho profissional valem para a divulgação?" });
  }
  return saida;
}
