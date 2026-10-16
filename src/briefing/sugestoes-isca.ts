import type { FormatoIscaValor, Nicho } from "./opcoes";

export type SugestaoIsca = { chave: string; titulo: string; formato: FormatoIscaValor };

/** Ideias de isca (material gratuito) por nicho. A chave fica gravada na Isca. */
export const SUGESTOES_ISCA: Record<Nicho, SugestaoIsca[]> = {
  PRODUTO_FISICO: [
    { chave: "fisico-cupom", titulo: "Cupom de primeira compra", formato: "CUPOM" },
    { chave: "fisico-frete", titulo: "Frete grátis no primeiro pedido", formato: "CUPOM" },
    { chave: "fisico-guia", titulo: "Guia de uso ou de escolha do produto", formato: "CHECKLIST_PDF" },
  ],
  PRODUTO_DIGITAL: [
    { chave: "digital-amostra", titulo: "Capítulo ou amostra grátis", formato: "AMOSTRA" },
    { chave: "digital-checklist", titulo: "Checklist", formato: "CHECKLIST_PDF" },
    { chave: "digital-aula", titulo: "Miniaula de 15 minutos", formato: "AULA_VIDEO" },
  ],
  SAAS: [
    { chave: "saas-teste", titulo: "Teste grátis de 14 dias", formato: "TESTE_GRATIS" },
    { chave: "saas-modelo", titulo: "Modelo pronto para usar", formato: "AMOSTRA" },
    { chave: "saas-demo", titulo: "Demonstração ao vivo", formato: "AULA_VIDEO" },
  ],
  SERVICO_LOCAL: [
    { chave: "local-orcamento", titulo: "Avaliação ou orçamento grátis", formato: "DIAGNOSTICO" },
    { chave: "local-cupom", titulo: "Cupom de primeira visita", formato: "CUPOM" },
    { chave: "local-checklist", titulo: "Checklist do serviço", formato: "CHECKLIST_PDF" },
  ],
  MENTORIA: [
    { chave: "mentoria-diagnostico", titulo: "Diagnóstico de 20 minutos", formato: "DIAGNOSTICO" },
    { chave: "mentoria-planilha", titulo: "Planilha ou roteiro", formato: "CHECKLIST_PDF" },
    { chave: "mentoria-aula", titulo: "Aula de 15 minutos", formato: "AULA_VIDEO" },
  ],
  TERAPIA_SAUDE: [
    { chave: "saude-ebook", titulo: "E-book educativo", formato: "CHECKLIST_PDF" },
    { chave: "saude-autoavaliacao", titulo: "Teste de autoavaliação (sem diagnóstico)", formato: "OUTRO" },
    { chave: "saude-live", titulo: "Live tira-dúvidas", formato: "AULA_VIDEO" },
  ],
  CURSO: [
    { chave: "curso-aula", titulo: "Aula grátis", formato: "AULA_VIDEO" },
    { chave: "curso-checklist", titulo: "Checklist", formato: "CHECKLIST_PDF" },
    { chave: "curso-desafio", titulo: "Desafio de 5 dias", formato: "OUTRO" },
  ],
  OUTRO: [
    { chave: "outro-checklist", titulo: "Checklist", formato: "CHECKLIST_PDF" },
    { chave: "outro-aula", titulo: "Aula de 15 minutos", formato: "AULA_VIDEO" },
    { chave: "outro-cupom", titulo: "Cupom", formato: "CUPOM" },
  ],
};

export function buscarSugestao(chave: string | null | undefined): SugestaoIsca | null {
  if (!chave) return null;
  for (const lista of Object.values(SUGESTOES_ISCA)) {
    const s = lista.find((x) => x.chave === chave);
    if (s) return s;
  }
  return null;
}
