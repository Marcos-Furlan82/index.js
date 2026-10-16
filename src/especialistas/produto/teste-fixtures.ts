import type { ContextoBriefing } from "@/briefing/obrigatorios";
import type { SaidaIA } from "./esquema";

/** Dados fictícios para testes (sem IA). */
export const PROVA_AUTORIZADA = "6f1c2a8e-1111-4222-8333-444455556666";
export const PROVA_SEM_AUTORIZACAO = "6f1c2a8e-1111-4222-8333-444455557777";

export function contextoExemplo(parcial: Partial<ContextoBriefing> = {}): ContextoBriefing {
  return {
    contaId: "conta-1",
    principal: true,
    produto: {
      id: "produto-1",
      nome: "Curso Confeitaria que Vende",
      briefing: {
        descricao: "Curso online de confeitaria para vender doces de festa",
        preco: "297,00",
        formaCompra: "LINK_CHECKOUT",
        perfil: "Mulheres de 30 a 45 anos",
        dor: "Gastam com ingredientes e não conseguem vender",
        desejo: "Renda extra fixa trabalhando em casa",
        objecaoPrincipal: "Medo de não ter tempo",
        diferencial: "Receitas testadas para vender, com custo calculado",
        provas: [
          { id: PROVA_AUTORIZADA, tipo: "NUMERO", conteudo: "1.200 alunas, nota 4,9", fonte: "Hotmart", autorizadoUso: true },
          { id: PROVA_SEM_AUTORIZACAO, tipo: "DEPOIMENTO", conteudo: "Maria: faturei SEGREDO-NAO-AUTORIZADO", fonte: "WhatsApp", autorizadoUso: false },
        ],
      },
    },
    marca: { nicho: "CURSO", objetivo90d: "LEADS", tomVoz: ["PROXIMO"], palavrasProibidas: ["fácil"] },
    isca: { escolha: "TEM", descricao: "Apostila com 10 receitas", formato: "CHECKLIST_PDF", comoRecebe: "LINK_BIO", pronta: true },
    ...parcial,
  };
}

export function saidaExemplo(parcial: Partial<SaidaIA> = {}): SaidaIA {
  return {
    promessaCentral: "Doces de festa que vendem, com receitas testadas e custo calculado",
    oferta: { preco: "R$ 297,00", formaCompra: "Link de pagamento (Hotmart)", condicoes: "Acesso por 1 ano" },
    persona: {
      nomeFicticio: "Ana",
      perfil: "Mulher de 30 a 45 anos que quer renda extra",
      dores: ["Gasta com ingredientes e não vende"],
      desejos: ["Renda extra fixa"],
      gatilhosCompra: ["Ver alunas vendendo"],
      nivelConsciencia: "problema",
    },
    diferencial: "Receitas testadas para vender, com custo calculado",
    diferenciaisSecundarios: ["Aulas curtas"],
    objecoes: [{ objecao: "Não tenho tempo", resposta: "As aulas têm 15 minutos.", provaRef: "inexistente" }],
    podePrometer: ["Receitas testadas"],
    naoPodePrometer: ["Garantir renda"],
    compliance: { orgao: null, regras: ["Não prometer renda garantida"], termosProibidos: [] },
    ctaPrincipal: { acao: "baixar_isca", texto: "Pegue a apostila grátis", destino: "Link na bio" },
    pendencias: [{ campo: "persona", pergunta: "Qual a cidade das alunas?", criticidade: "melhora" }],
    confianca: [
      { campo: "promessaCentral", nivel: "inferido" },
      { campo: "oferta", nivel: "informado" },
      { campo: "persona", nivel: "inferido" },
    ],
    ...parcial,
  };
}
