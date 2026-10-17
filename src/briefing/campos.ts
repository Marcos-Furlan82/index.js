import {
  CANAIS,
  FORMAS_COMPRA,
  MARCA_CONHECIDA,
  NICHOS,
  OBJETIVOS,
  QUEM_APARECE,
  TONS,
} from "./opcoes";
import { LIMITE_CURTO, LIMITE_DIFERENCIAL, LIMITE_LONGO } from "./esquemas";

/**
 * Perguntas do briefing, na ordem e com os textos da tela (título, ajuda e
 * exemplo). Sem dependências de servidor: o formulário do navegador usa isto.
 */

export type TipoCampo =
  | "texto"
  | "textoLongo"
  | "numero"
  | "data"
  | "escolha"
  | "multipla"
  | "simNao"
  | "tags"
  | "provas"
  | "datas"
  | "isca";

export type DefinicaoCampo = {
  chave: string;
  alvo: "marca" | "produto";
  tipo: TipoCampo;
  rotulo: string;
  ajuda?: string;
  placeholder?: string;
  opcoes?: { valor: string; rotulo: string }[];
  max?: number;
  min?: number;
  /** Necessário para gerar a ficha. */
  obrigatorio?: boolean;
  /** Só aparece quando outro campo tem este valor. */
  mostrarSe?: { campo: string; valor: string };
};

export type Pergunta = {
  numero: number;
  titulo: string;
  ajuda?: string;
  /** Perguntas não críticas podem ser marcadas "Responder depois". */
  podeDepois?: boolean;
  campos: DefinicaoCampo[];
};

const lista = (o: { rotulos: Record<string, string> }) =>
  Object.entries(o.rotulos).map(([valor, rotulo]) => ({ valor, rotulo }));

export const PERGUNTAS: Record<number, Pergunta> = {
  1: {
    numero: 1,
    titulo: "O que você vende?",
    ajuda: "Produto, preço e como a pessoa compra.",
    campos: [
      { chave: "nome", alvo: "produto", tipo: "texto", rotulo: "Nome do produto", placeholder: "Curso Confeitaria que Vende", max: 120, obrigatorio: true },
      {
        chave: "descricao",
        alvo: "produto",
        tipo: "textoLongo",
        rotulo: "Em poucas palavras, o que é",
        placeholder: "Curso online de confeitaria, R$ 297, compra pelo link da Hotmart",
        max: LIMITE_LONGO,
        obrigatorio: true,
      },
      { chave: "preco", alvo: "produto", tipo: "texto", rotulo: "Preço (R$)", placeholder: "297,00", max: LIMITE_CURTO, obrigatorio: true },
      { chave: "formaCompra", alvo: "produto", tipo: "escolha", rotulo: "Como a pessoa compra", opcoes: lista(FORMAS_COMPRA), obrigatorio: true },
    ],
  },
  2: {
    numero: 2,
    titulo: "Qual é o seu nicho?",
    ajuda: "Escolha o mais próximo; se nenhum servir, \"Outro\".",
    campos: [
      { chave: "nicho", alvo: "marca", tipo: "escolha", rotulo: "Nicho", opcoes: lista(NICHOS), obrigatorio: true },
      {
        chave: "nichoDescricao",
        alvo: "marca",
        tipo: "texto",
        rotulo: "Descreva o seu nicho",
        max: LIMITE_CURTO,
        mostrarSe: { campo: "nicho", valor: "OUTRO" },
        obrigatorio: true,
      },
    ],
  },
  3: {
    numero: 3,
    titulo: "Quem compra de você?",
    ajuda: "Perfil, o que incomoda, o que quer, o que faz hesitar.",
    campos: [
      { chave: "perfil", alvo: "produto", tipo: "texto", rotulo: "Perfil", placeholder: "Mulheres de 30 a 45 anos, querem renda extra", max: LIMITE_CURTO },
      { chave: "dor", alvo: "produto", tipo: "textoLongo", rotulo: "O que incomoda", placeholder: "Gastam com ingredientes e não conseguem vender os doces", max: LIMITE_LONGO, obrigatorio: true },
      { chave: "desejo", alvo: "produto", tipo: "textoLongo", rotulo: "O que quer", placeholder: "Ter uma renda extra fixa trabalhando em casa", max: LIMITE_LONGO },
      { chave: "objecaoPrincipal", alvo: "produto", tipo: "textoLongo", rotulo: "O que faz hesitar", placeholder: "Medo de não ter tempo", max: LIMITE_LONGO, obrigatorio: true },
    ],
  },
  4: {
    numero: 4,
    titulo: "Por que você e não outro?",
    ajuda: "Uma frase.",
    campos: [
      { chave: "diferencial", alvo: "produto", tipo: "texto", rotulo: "Seu diferencial", placeholder: "Receitas testadas para vender, com custo calculado", max: LIMITE_DIFERENCIAL, obrigatorio: true },
    ],
  },
  5: {
    numero: 5,
    titulo: "O que comprova seu resultado?",
    ajuda: "Só o que for verdadeiro e puder ser mostrado. Se não tiver ainda, pode deixar em branco.",
    podeDepois: true,
    campos: [{ chave: "provas", alvo: "produto", tipo: "provas", rotulo: "Provas", placeholder: "1.200 alunas, nota 4,9" }],
  },
  6: {
    numero: 6,
    titulo: "Como está a conta hoje?",
    ajuda: "Seguidores aproximados e data do último post. Pode ser de cabeça.",
    podeDepois: true,
    campos: [
      { chave: "seguidores", alvo: "marca", tipo: "numero", rotulo: "Seguidores (aproximado)", placeholder: "3400", min: 0 },
      { chave: "ultimoPost", alvo: "marca", tipo: "data", rotulo: "Data do último post" },
      { chave: "postaHoje", alvo: "marca", tipo: "simNao", rotulo: "Você está postando hoje em dia?" },
    ],
  },
  7: {
    numero: 7,
    titulo: "As pessoas já conhecem sua marca fora do Instagram?",
    podeDepois: true,
    campos: [
      { chave: "marcaConhecida", alvo: "marca", tipo: "escolha", rotulo: "Sua marca é conhecida", opcoes: lista(MARCA_CONHECIDA) },
      { chave: "canaisExistentes", alvo: "marca", tipo: "multipla", rotulo: "Onde mais você fala com clientes", opcoes: lista(CANAIS) },
    ],
  },
  8: {
    numero: 8,
    titulo: "O que você quer em 90 dias?",
    ajuda: "Escolha o principal.",
    campos: [
      { chave: "objetivo90d", alvo: "marca", tipo: "escolha", rotulo: "Objetivo principal", opcoes: lista(OBJETIVOS), obrigatorio: true },
      { chave: "metaNumerica", alvo: "marca", tipo: "numero", rotulo: "Meta em número (opcional)", placeholder: "50", min: 0 },
    ],
  },
  9: {
    numero: 9,
    titulo: "Você tem algo gratuito para oferecer?",
    ajuda: "Um material ou benefício que atrai interessados antes da venda. Aqui chamamos de isca.",
    campos: [{ chave: "isca", alvo: "produto", tipo: "isca", rotulo: "Isca", obrigatorio: true }],
  },
  10: {
    numero: 10,
    titulo: "Quantas vezes por semana dá para postar, e quem aparece em vídeo?",
    ajuda: "Constância vale mais que volume.",
    podeDepois: true,
    campos: [
      { chave: "postsSemana", alvo: "marca", tipo: "numero", rotulo: "Posts por semana", placeholder: "3", min: 1, max: 14 },
      { chave: "quemAparece", alvo: "marca", tipo: "multipla", rotulo: "Quem aparece", opcoes: lista(QUEM_APARECE) },
      { chave: "gravaVideo", alvo: "marca", tipo: "simNao", rotulo: "Dá para gravar vídeos?" },
    ],
  },
  11: {
    numero: 11,
    titulo: "Como sua marca fala, e o que ela nunca diz?",
    ajuda: "Tom, palavras proibidas, regras do conselho profissional.",
    campos: [
      { chave: "tomVoz", alvo: "marca", tipo: "multipla", rotulo: "Tom de voz", opcoes: lista(TONS), obrigatorio: true },
      { chave: "palavrasProibidas", alvo: "marca", tipo: "tags", rotulo: "Palavras que a marca nunca usa", placeholder: "Digite e aperte Enter" },
      {
        chave: "restricoesLegais",
        alvo: "marca",
        tipo: "textoLongo",
        rotulo: "Regras e restrições",
        placeholder: "Próxima, sem gírias; nunca prometer cura",
        max: LIMITE_LONGO,
      },
    ],
  },
  12: {
    numero: 12,
    titulo: "Datas importantes",
    ajuda: "Lançamentos, temporadas, feriados que vendem.",
    podeDepois: true,
    campos: [{ chave: "datas", alvo: "marca", tipo: "datas", rotulo: "Datas" }],
  },
};

/** Perguntas de cada etapa do assistente (a etapa 5 é a de referências visuais). */
export const PERGUNTAS_POR_ETAPA: Record<number, number[]> = {
  1: [1, 2, 4],
  2: [3, 5],
  3: [6, 7, 8, 12],
  4: [9, 10, 11],
};

/** Produto secundário: só as perguntas que mudam de um produto para outro. */
export const PERGUNTAS_SECUNDARIO = [1, 3, 4, 5, 9];
