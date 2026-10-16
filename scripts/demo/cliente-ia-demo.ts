import type { SaidaIA } from "../../src/especialistas/produto/esquema";
import { MODELO_TEXTO_PADRAO } from "../../src/ia/config";
import type { ClienteIA, PedidoEstruturado, RespostaEstruturada } from "../../src/ia";

/**
 * Cliente de IA FALSO, só para a demonstração local: devolve fichas fictícias
 * plausíveis (com campos deduzidos e pendências), sem chamar a API.
 */

const DOCE_ATELIE: SaidaIA = {
  promessaCentral: "Aprenda doces de festa que vendem, com receitas testadas e custo calculado",
  oferta: { preco: "R$ 297,00", formaCompra: "Link de pagamento (Hotmart)", condicoes: "Acesso por 12 meses e certificado" },
  persona: {
    nomeFicticio: "Camila",
    perfil: "Mulher de 30 a 45 anos, com filhos, que já faz doces para a família e quer transformar isso em renda",
    dores: ["Gasta com ingredientes e não sabe quanto cobrar", "Os doces não ficam com cara de profissional"],
    desejos: ["Ter uma renda extra fixa trabalhando de casa", "Receber encomendas toda semana"],
    gatilhosCompra: ["Ver alunas vendendo na própria cidade", "Saber o custo de cada receita antes de começar"],
    nivelConsciencia: "solucao",
  },
  diferencial: "Receitas testadas para vender, com custo calculado e preço sugerido",
  diferenciaisSecundarios: ["Aulas curtas, de até 15 minutos", "Planilha de precificação inclusa"],
  objecoes: [
    {
      objecao: "Não tenho tempo para fazer um curso",
      resposta: "As aulas são curtas e ficam gravadas: dá para assistir no intervalo do dia.",
      provaRef: null,
    },
    {
      objecao: "Será que alguém compra os meus doces?",
      resposta: "O curso mostra como montar o cardápio e divulgar no bairro. Mais de mil alunas já passaram por ele.",
      provaRef: "PROVA_1",
    },
  ],
  podePrometer: ["Receitas testadas", "Planilha para calcular o custo e o preço de venda", "Acesso por 12 meses"],
  naoPodePrometer: ["Garantir renda ou número de encomendas"],
  compliance: { orgao: null, regras: ["Não prometer renda garantida", "Mostrar resultados de alunas só com autorização"], termosProibidos: [] },
  ctaPrincipal: { acao: "baixar_isca", texto: "Pegue grátis a apostila com 10 receitas que mais vendem", destino: "Link na bio" },
  pendencias: [
    { campo: "persona", pergunta: "Em quais cidades estão a maioria das alunas?", criticidade: "melhora" },
    { campo: "diferenciaisSecundarios", pergunta: "Há suporte para tirar dúvidas? Por qual canal?", criticidade: "melhora" },
  ],
  confianca: [
    { campo: "promessaCentral", nivel: "inferido" },
    { campo: "oferta", nivel: "informado" },
    { campo: "persona", nivel: "inferido" },
    { campo: "diferencial", nivel: "informado" },
    { campo: "diferenciaisSecundarios", nivel: "inferido" },
    { campo: "objecoes", nivel: "inferido" },
    { campo: "ctaPrincipal", nivel: "informado" },
  ],
};

const CLINICA_RESPIRA: SaidaIA = {
  promessaCentral: "Terapia online para quem quer lidar melhor com a ansiedade no dia a dia",
  oferta: { preco: "R$ 180,00 por sessão", formaCompra: "Agendamento de horário", condicoes: "Sessões de 50 minutos por vídeo" },
  persona: {
    nomeFicticio: "Rafael",
    perfil: "Adulto de 25 a 40 anos, trabalha muito e sente a ansiedade atrapalhar o sono e o trabalho",
    dores: ["Dificuldade para dormir", "Sensação de estar sempre atrasado"],
    desejos: ["Ter mais calma para tomar decisões", "Dormir melhor"],
    gatilhosCompra: ["Uma crise que atrapalhou o trabalho", "Indicação de alguém de confiança"],
    nivelConsciencia: "problema",
  },
  diferencial: "Atendimento online com horários à noite, para quem trabalha o dia todo",
  diferenciaisSecundarios: ["Primeira conversa para tirar dúvidas"],
  objecoes: [
    {
      objecao: "Terapia online funciona?",
      resposta: "O atendimento online segue as mesmas regras do presencial. Você só precisa de um lugar reservado.",
      provaRef: null,
    },
    {
      objecao: "Quanto tempo leva para melhorar?",
      resposta: "Cada pessoa tem o seu tempo; resultado garantido em poucas sessões.",
      provaRef: null,
    },
  ],
  podePrometer: ["Escuta sem julgamento", "Sigilo profissional", "Horários à noite"],
  naoPodePrometer: ["Prometer cura da ansiedade"],
  compliance: {
    orgao: "Conselho Federal de Psicologia (CFP)",
    regras: ["Não divulgar preço como promoção", "Não usar depoimentos de pacientes"],
    termosProibidos: [],
  },
  ctaPrincipal: { acao: "agendar", texto: "Agende uma conversa", destino: "WhatsApp da clínica (link na bio)" },
  pendencias: [{ campo: "provas", pergunta: "Qual é a sua formação e o número do registro no CRP?", criticidade: "melhora" }],
  confianca: [
    { campo: "promessaCentral", nivel: "inferido" },
    { campo: "oferta", nivel: "informado" },
    { campo: "persona", nivel: "inferido" },
    { campo: "objecoes", nivel: "inferido" },
    { campo: "compliance", nivel: "inferido" },
    { campo: "ctaPrincipal", nivel: "informado" },
  ],
};

export function clienteIADemo(idsProvas: Record<string, string>): ClienteIA {
  return {
    async gerarEstruturado<T>(pedido: PedidoEstruturado<T>): Promise<RespostaEstruturada<T>> {
      const base = pedido.mensagem.includes("Confeitaria") ? DOCE_ATELIE : CLINICA_RESPIRA;
      const dados: SaidaIA = {
        ...base,
        objecoes: base.objecoes.map((o) => ({ ...o, provaRef: o.provaRef ? (idsProvas[o.provaRef] ?? null) : null })),
      };
      return {
        dados: dados as T,
        usos: [{ modelo: MODELO_TEXTO_PADRAO, uso: { tokensEntrada: 4200, tokensSaida: 3100, tokensCacheLeitura: 0, tokensCacheEscrita: 2600 } }],
        modelo: MODELO_TEXTO_PADRAO,
        fallbackUsado: false,
      };
    },
  };
}
