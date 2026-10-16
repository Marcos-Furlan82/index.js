/**
 * Opções das perguntas do briefing, com os rótulos mostrados na tela (sem jargão).
 * Sem dependências de servidor: usado também pelos componentes do navegador.
 */

function opcoes<const T extends Record<string, string>>(rotulos: T) {
  const valores = Object.keys(rotulos) as [keyof T & string, ...(keyof T & string)[]];
  return { rotulos, valores };
}

export const NICHOS = opcoes({
  PRODUTO_FISICO: "Produto físico",
  PRODUTO_DIGITAL: "Produto digital (e-book, planilha, modelo)",
  SAAS: "Software ou aplicativo por assinatura",
  SERVICO_LOCAL: "Serviço local",
  MENTORIA: "Mentoria",
  TERAPIA_SAUDE: "Terapia ou saúde",
  CURSO: "Curso",
  OUTRO: "Outro",
});
export type Nicho = (typeof NICHOS.valores)[number];

export const FORMAS_COMPRA = opcoes({
  SITE: "Site ou loja virtual",
  WHATSAPP_DM: "WhatsApp ou mensagem no Instagram",
  LOJA_FISICA: "Loja física",
  LINK_CHECKOUT: "Link de pagamento (ex.: Hotmart, Kiwify)",
  AGENDA: "Agendamento de horário",
});

export const TIPOS_PROVA = opcoes({
  DEPOIMENTO: "Depoimento de cliente",
  NUMERO: "Número (clientes, nota, vendas)",
  CASE: "Caso de cliente (antes e depois)",
  CERTIFICACAO: "Certificação ou formação",
  MIDIA: "Apareceu na imprensa",
});

export const MARCA_CONHECIDA = opcoes({
  NAO: "Ainda não",
  LOCAL: "Sim, na minha cidade ou bairro",
  REGIONAL: "Sim, na minha região",
  NACIONAL: "Sim, no país todo",
});

export const CANAIS = opcoes({
  LISTA_EMAIL: "Lista de e-mails",
  WHATSAPP: "Grupo ou lista no WhatsApp",
  LOJA: "Loja física",
  OUTRA_REDE: "Outra rede social",
});

export const OBJETIVOS = opcoes({
  SEGUIDORES: "Mais seguidores",
  LEADS: "Mais contatos de pessoas interessadas",
  VENDAS: "Mais vendas",
  AGENDA: "Agenda cheia (mais horários marcados)",
});
export type Objetivo = (typeof OBJETIVOS.valores)[number];

export const QUEM_APARECE = opcoes({
  DONO: "Eu (dono ou dona)",
  EQUIPE: "Minha equipe",
  CLIENTES: "Clientes",
  NINGUEM: "Ninguém",
});

export const TONS = opcoes({
  PROXIMO: "Próximo",
  TECNICO: "Técnico",
  DIVERTIDO: "Divertido",
  INSPIRADOR: "Inspirador",
  SERIO: "Sério",
});

export const TIPOS_DATA = opcoes({
  VENDA: "Data de venda (ex.: Black Friday)",
  LANCAMENTO: "Lançamento",
  SAZONAL: "Temporada ou feriado",
});

export const PAPEIS_COR = opcoes({ PRINCIPAL: "Principal", APOIO: "Apoio", FUNDO: "Fundo" });

export const ORIGENS_FONTE = opcoes({ GOOGLE: "Google Fonts", COMPRADA: "Comprada", NAO_SEI: "Não sei" });

export const ESCOLHAS_ISCA = opcoes({
  TEM: "Sim, já tenho",
  SUGESTAO: "Ainda não, quero uma ideia",
  SEM_ISCA: "Sem isca neste ciclo",
});

export const FORMATOS_ISCA = opcoes({
  CHECKLIST_PDF: "Checklist ou PDF",
  AULA_VIDEO: "Aula ou vídeo",
  CUPOM: "Cupom de desconto",
  DIAGNOSTICO: "Diagnóstico ou consulta grátis",
  TESTE_GRATIS: "Teste grátis",
  AMOSTRA: "Amostra",
  OUTRO: "Outro",
});
export type FormatoIscaValor = (typeof FORMATOS_ISCA.valores)[number];

export const ENTREGAS_ISCA = opcoes({
  LINK_BIO: "Link na bio",
  DM: "Mensagem no Instagram (manual)",
  WHATSAPP: "WhatsApp",
  EMAIL: "E-mail",
});
