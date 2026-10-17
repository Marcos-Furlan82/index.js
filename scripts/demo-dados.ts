import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { gravarLocal, PASTA_LOCAL, r2Configurado } from "../src/armazenamento/local";
import { gravarObjeto } from "../src/armazenamento/r2";
import { concluirReferencias } from "../src/armazenamento/referencias";
import { gerarHashSenha } from "../src/auth/senha";
import { salvarIsca, salvarRespostasBriefing } from "../src/briefing/salvar";
import { criarConta } from "../src/contas/contas";
import { criarProduto } from "../src/contas/produtos";
import { registrarCusto } from "../src/custos/registrar";
import { aprovarFicha, marcarBlocoRevisado, solicitarGeracaoFicha } from "../src/especialistas/produto/fichas";
import { lerFicha } from "../src/especialistas/produto/gerar";
import { blocosComInferido } from "../src/especialistas/produto/regras";
import { definirClienteIA } from "../src/ia";
import { MODELO_TEXTO_PADRAO, MODELOS_FALLBACK_CONHECIDOS } from "../src/ia/config";
import { executarLote } from "../src/jobs/executor";
import { desconectarDb, obterDb } from "../src/lib/db";
import { clienteIADemo } from "./demo/cliente-ia-demo";

/**
 * Dados de DEMONSTRAÇÃO para o ambiente LOCAL (nunca em produção):
 *
 *   pnpm demo:dados
 *
 * Cria (ou recria) o gestor demo, cotação e preços de exemplo, duas contas
 * fictícias com briefing, isca, referências visuais (imagens geradas aqui) e
 * fichas do produto geradas por um cliente de IA FALSO (sem chamar a API):
 * uma APROVADA (Doce Ateliê) e uma em revisão (Clínica Respira).
 *
 * Login da demonstração (só para ambiente local):
 *   e-mail: demo@exemplo.com
 *   senha:  demo-local-2026!
 *
 * Sem as variáveis do R2 no .env, as imagens ficam em .armazenamento-local/ e
 * são servidas pela rota /api/dev/arquivo (só em desenvolvimento).
 */

const EMAIL_DEMO = "demo@exemplo.com";
const SENHA_DEMO = "demo-local-2026!";
const USUARIOS_DEMO = ["doceatelie.demo", "clinicarespira.demo"];

function recusarAmbienteErrado() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Recusado: o script de demonstração nunca roda com NODE_ENV=production.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Defina DATABASE_URL (banco de desenvolvimento).");
  const host = new URL(url).hostname;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  if (!local && !process.argv.includes("--permitir-banco-remoto")) {
    throw new Error(`Recusado: DATABASE_URL aponta para "${host}". Use um banco local (ou --permitir-banco-remoto, por sua conta).`);
  }
}

async function limparDemoAnterior() {
  const db = obterDb();
  const contas = await db.contaInstagram.findMany({ where: { usuarioInstagram: { in: USUARIOS_DEMO } }, select: { id: true } });
  const ids = contas.map((c) => c.id);
  if (ids.length === 0) return;
  await db.geracaoIA.deleteMany({ where: { contaId: { in: ids } } });
  await db.reservaOrcamento.deleteMany({ where: { contaId: { in: ids } } });
  await db.notificacao.deleteMany({ where: { contaId: { in: ids } } });
  await db.alertaOrcamento.deleteMany({ where: { escopo: { in: ids } } });
  await db.job.deleteMany({ where: { contaId: { in: ids } } });
  await db.midia.deleteMany({ where: { contaId: { in: ids } } });
  await db.contaInstagram.deleteMany({ where: { id: { in: ids } } });
  for (const id of ids) await rm(path.join(PASTA_LOCAL, "contas", id), { recursive: true, force: true });
  console.log(`Demonstração anterior removida (${ids.length} contas).`);
}

async function prepararGestorEOrcamento() {
  const db = obterDb();
  const senhaHash = await gerarHashSenha(SENHA_DEMO);
  await db.usuario.upsert({
    where: { email: EMAIL_DEMO },
    update: { senhaHash },
    create: { email: EMAIL_DEMO, nome: "Gestor Demo", senhaHash },
  });
  await db.configuracao.upsert({
    where: { id: "global" },
    update: { cotacaoUsdBrl: "5.40", cotacaoAtualizadaEm: new Date(), cotacaoAtualizadaPor: EMAIL_DEMO, tetoMensalBrl: "1000" },
    create: { id: "global", tetoMensalBrl: "1000", cotacaoUsdBrl: "5.40", cotacaoAtualizadaEm: new Date(), cotacaoAtualizadaPor: EMAIL_DEMO },
  });
  // Valores de EXEMPLO (confira sempre a página de preços da Anthropic).
  const precos: [string, string, string, string, string][] = [
    [MODELO_TEXTO_PADRAO, "4", "20", "0.20", "5"],
    ...MODELOS_FALLBACK_CONHECIDOS.map((m) => [m, "5", "25", "0.50", "6.25"] as [string, string, string, string, string]),
  ];
  for (const [modelo, entrada, saida, leitura, escrita] of precos) {
    const dados = { usdPorMTokEntrada: entrada, usdPorMTokSaida: saida, usdPorMTokCacheLeitura: leitura, usdPorMTokCacheEscrita: escrita };
    await db.precoModelo.upsert({
      where: { provedor_modelo: { provedor: "anthropic", modelo } },
      update: dados,
      create: { provedor: "anthropic", modelo, ...dados },
    });
  }
}

// ---------------------------------------------------------------------------
// Imagens fictícias (geradas com sharp a partir de SVG simples, sem texto)
// ---------------------------------------------------------------------------

function svgArte(largura: number, altura: number, cores: [string, string, string], forma: "circulos" | "faixas" | "ondas") {
  const [a, b, c] = cores;
  const desenho =
    forma === "circulos"
      ? `<circle cx="${largura * 0.3}" cy="${altura * 0.4}" r="${largura * 0.22}" fill="${b}"/><circle cx="${largura * 0.68}" cy="${altura * 0.62}" r="${largura * 0.16}" fill="${c}" opacity="0.85"/>`
      : forma === "faixas"
        ? `<rect x="0" y="${altura * 0.55}" width="${largura}" height="${altura * 0.12}" fill="${b}"/><rect x="0" y="${altura * 0.7}" width="${largura}" height="${altura * 0.05}" fill="${c}"/><rect x="${largura * 0.1}" y="${altura * 0.12}" width="${largura * 0.5}" height="${altura * 0.06}" rx="12" fill="#ffffff" opacity="0.9"/>`
        : `<path d="M0 ${altura * 0.6} Q ${largura * 0.25} ${altura * 0.45} ${largura * 0.5} ${altura * 0.6} T ${largura} ${altura * 0.6} V ${altura} H 0 Z" fill="${b}"/><circle cx="${largura * 0.75}" cy="${altura * 0.25}" r="${largura * 0.1}" fill="${c}"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}"><rect width="100%" height="100%" fill="${a}"/>${desenho}</svg>`);
}

function svgLogo(cor: string, destaque: string) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400"><circle cx="200" cy="200" r="150" fill="${cor}"/><circle cx="200" cy="200" r="70" fill="${destaque}"/><rect x="400" y="140" width="680" height="50" rx="25" fill="${cor}"/><rect x="400" y="220" width="480" height="40" rx="20" fill="${destaque}"/></svg>`,
  );
}

async function guardar(chave: string, corpo: Buffer, tipo: string) {
  if (r2Configurado()) await gravarObjeto(chave, corpo, tipo, "privada");
  else await gravarLocal(chave, corpo);
}

async function criarReferencia(
  contaId: string,
  categoria: "LOGO" | "ARTE",
  arquivo: { corpo: Buffer; tipo: "image/png" | "image/jpeg" | "image/svg+xml"; nome: string },
  meta: Partial<{ origem: "PROPRIA" | "TERCEIROS"; gosta: string[]; formato: "POST" | "CARROSSEL" | "STORIES" | "CAPA_REELS"; peso: "EXATO" | "SO_A_IDEIA"; naoGosta: string; avisos: string[] }> = {},
) {
  const db = obterDb();
  const extensao = { "image/png": "png", "image/jpeg": "jpg", "image/svg+xml": "svg" }[arquivo.tipo];
  const chave = `contas/${contaId}/referencias/${randomUUID()}.${extensao}`;
  const info = await sharp(arquivo.corpo).metadata();
  const miniatura = await sharp(arquivo.corpo).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  await guardar(chave, arquivo.corpo, arquivo.tipo);
  await guardar(`${chave}.mini.webp`, miniatura, "image/webp");
  const midia = await db.midia.create({
    data: {
      contaId,
      origem: "UPLOAD",
      status: "DISPONIVEL",
      privada: true,
      chave,
      tipoMime: arquivo.tipo,
      tamanhoBytes: BigInt(arquivo.corpo.length),
      nomeOriginal: arquivo.nome,
      largura: info.width ?? null,
      altura: info.height ?? null,
      temAlfa: arquivo.tipo === "image/svg+xml" ? true : !!info.hasAlpha,
      sha256: createHash("sha256").update(arquivo.corpo).digest("hex"),
      miniaturaChave: `${chave}.mini.webp`,
      confirmadoEm: new Date(),
    },
  });
  await db.referencia.create({
    data: {
      contaId,
      midiaId: midia.id,
      categoria,
      origem: meta.origem ?? null,
      gosta: meta.gosta ?? [],
      naoGosta: meta.naoGosta ?? null,
      formato: meta.formato ?? null,
      peso: meta.peso ?? null,
      direitoDeclarado: categoria === "LOGO" || meta.origem === "PROPRIA",
      avisos: meta.avisos ?? [],
    },
  });
}

async function png(svg: Buffer) {
  return sharp(svg).png().toBuffer();
}

async function jpg(svg: Buffer) {
  return sharp(svg).jpeg({ quality: 85 }).toBuffer();
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

async function criarDoceAtelie() {
  const r = await criarConta({ nome: "Doce Ateliê", usuarioInstagram: "doceatelie.demo" });
  if (!r.ok) throw new Error(r.erro);
  const conta = r.valor;
  const produtoId = conta.produtoPrincipalId!;
  const provaNumero = randomUUID();
  await salvarRespostasBriefing({
    contaId: conta.id,
    produtoId,
    etapa: 5,
    marca: {
      nicho: "CURSO",
      seguidores: 3400,
      ultimoPost: "2026-09-28",
      postaHoje: true,
      marcaConhecida: "LOCAL",
      canaisExistentes: ["WHATSAPP"],
      objetivo90d: "LEADS",
      metaNumerica: 300,
      postsSemana: 3,
      quemAparece: ["DONO"],
      gravaVideo: true,
      tomVoz: ["PROXIMO", "INSPIRADOR"],
      palavrasProibidas: ["fácil", "milagre"],
      restricoesLegais: "Sem gírias. Nunca prometer renda garantida.",
      datas: [
        { id: randomUUID(), data: "2026-11-27", nome: "Black Friday", tipo: "VENDA" },
        { id: randomUUID(), data: "2027-05-09", nome: "Dia das Mães", tipo: "SAZONAL" },
      ],
      cores: [
        { hex: "#C2185B", papel: "PRINCIPAL" },
        { hex: "#F8BBD0", papel: "APOIO" },
        { hex: "#FFF8F0", papel: "FUNDO" },
      ],
      fontes: [{ id: randomUUID(), familia: "Montserrat", origem: "GOOGLE" }],
      links: ["https://www.instagram.com/exemplo.confeitaria"],
    },
    produto: {
      nome: "Curso Confeitaria que Vende",
      descricao: "Curso online de confeitaria para quem quer vender doces de festa, com 40 receitas testadas.",
      preco: "297,00",
      formaCompra: "LINK_CHECKOUT",
      perfil: "Mulheres de 30 a 45 anos que querem renda extra",
      dor: "Gastam com ingredientes, não sabem quanto cobrar e os doces não têm cara de profissional.",
      desejo: "Ter uma renda extra fixa trabalhando de casa.",
      objecaoPrincipal: "Medo de não ter tempo para estudar e produzir.",
      diferencial: "Receitas testadas para vender, com custo calculado",
      provas: [
        { id: provaNumero, tipo: "NUMERO", conteudo: "1.200 alunas, nota 4,9 na plataforma", fonte: "Avaliações da Hotmart", autorizadoUso: true },
        { id: randomUUID(), tipo: "DEPOIMENTO", conteudo: "Depoimento da aluna Júlia (aguardando autorização)", fonte: "WhatsApp", autorizadoUso: false },
      ],
    },
  });
  await salvarIsca(produtoId, {
    escolha: "TEM",
    descricao: "Apostila com as 10 receitas que mais vendem",
    formato: "CHECKLIST_PDF",
    comoRecebe: "LINK_BIO",
    pronta: true,
  });
  const secundario = await criarProduto(conta.id, "Kit de Formas Profissionais");
  if (secundario.ok) {
    await salvarRespostasBriefing({
      contaId: conta.id,
      produtoId: secundario.valor.id,
      produto: { descricao: "Kit com 12 formas de silicone para doces finos", preco: "89,90", formaCompra: "SITE" },
    });
  }
  await obterDb().contaInstagram.update({ where: { id: conta.id }, data: { tetoMensalBrl: "300" } });

  const rosa: [string, string, string] = ["#FFF8F0", "#C2185B", "#F8BBD0"];
  await criarReferencia(conta.id, "LOGO", { corpo: await png(svgLogo("#C2185B", "#F8BBD0")), tipo: "image/png", nome: "logo-doce-atelie.png" });
  await criarReferencia(conta.id, "ARTE", { corpo: await jpg(svgArte(1080, 1080, rosa, "circulos")), tipo: "image/jpeg", nome: "post-receita.jpg" }, {
    origem: "PROPRIA",
    gosta: ["CORES", "LAYOUT"],
    formato: "POST",
    peso: "EXATO",
  });
  await criarReferencia(conta.id, "ARTE", { corpo: await jpg(svgArte(1080, 1350, ["#F8BBD0", "#880E4F", "#FFFFFF"], "faixas")), tipo: "image/jpeg", nome: "carrossel-capa.jpg" }, {
    origem: "PROPRIA",
    gosta: ["TIPOGRAFIA", "QUANTIDADE_TEXTO"],
    formato: "CARROSSEL",
    peso: "SO_A_IDEIA",
  });
  await criarReferencia(conta.id, "ARTE", { corpo: await jpg(svgArte(1080, 1920, ["#FCE4EC", "#AD1457", "#FFD54F"], "ondas")), tipo: "image/jpeg", nome: "stories-inspiracao.jpg" }, {
    origem: "TERCEIROS",
    gosta: ["CLIMA", "FOTO"],
    naoGosta: "Muito texto no rodapé",
    formato: "STORIES",
    peso: "SO_A_IDEIA",
  });
  await criarReferencia(conta.id, "ARTE", { corpo: await jpg(svgArte(1080, 1080, ["#FFFFFF", "#C2185B", "#4E342E"], "faixas")), tipo: "image/jpeg", nome: "post-promocao.jpg" }, {
    origem: "PROPRIA",
    gosta: ["LAYOUT"],
    formato: "POST",
    peso: "EXATO",
  });
  const concluido = await concluirReferencias(conta.id);
  if (!concluido.ok) throw new Error(concluido.erro);
  return { conta, produtoId, provaNumero };
}

async function criarClinicaRespira() {
  const r = await criarConta({ nome: "Clínica Respira", usuarioInstagram: "clinicarespira.demo" });
  if (!r.ok) throw new Error(r.erro);
  const conta = r.valor;
  const produtoId = conta.produtoPrincipalId!;
  await salvarRespostasBriefing({
    contaId: conta.id,
    produtoId,
    etapa: 5,
    marca: {
      nicho: "TERAPIA_SAUDE",
      seguidores: 820,
      ultimoPost: "2026-08-15",
      postaHoje: false,
      marcaConhecida: "NAO",
      canaisExistentes: [],
      objetivo90d: "AGENDA",
      postsSemana: 2,
      quemAparece: ["NINGUEM"],
      gravaVideo: false,
      tomVoz: ["SERIO", "PROXIMO"],
      palavrasProibidas: ["cura"],
      restricoesLegais: "Seguir o Código de Ética do CFP: sem promessa de resultado e sem depoimento de paciente.",
      cores: [
        { hex: "#00695C", papel: "PRINCIPAL" },
        { hex: "#E0F2F1", papel: "FUNDO" },
      ],
    },
    produto: {
      nome: "Terapia online para ansiedade",
      descricao: "Sessões de psicoterapia online, de 50 minutos, para adultos com ansiedade.",
      preco: "180,00",
      formaCompra: "AGENDA",
      dor: "A ansiedade atrapalha o sono, o trabalho e as relações.",
      objecaoPrincipal: "Dúvida se terapia online funciona e medo do custo mensal.",
      diferencial: "Atendimento online com horários à noite",
      provas: [],
    },
  });
  await salvarIsca(produtoId, { escolha: "SUGESTAO", sugestaoChave: "saude-ebook" });
  await obterDb().contaInstagram.update({ where: { id: conta.id }, data: { tetoMensalBrl: "200" } });

  await criarReferencia(conta.id, "LOGO", { corpo: svgLogo("#00695C", "#80CBC4"), tipo: "image/svg+xml", nome: "logo-respira.svg" });
  await criarReferencia(conta.id, "ARTE", { corpo: await jpg(svgArte(1080, 1350, ["#E0F2F1", "#00695C", "#FFFFFF"], "ondas")), tipo: "image/jpeg", nome: "post-calma.jpg" }, {
    origem: "TERCEIROS",
    gosta: ["CORES", "CLIMA"],
    formato: "POST",
    peso: "SO_A_IDEIA",
  });
  await criarReferencia(conta.id, "ARTE", { corpo: await jpg(svgArte(1080, 1080, ["#FFFFFF", "#004D40", "#A5D6A7"], "circulos")), tipo: "image/jpeg", nome: "carrossel-dicas.jpg" }, {
    origem: "TERCEIROS",
    gosta: ["LAYOUT"],
    formato: "CARROSSEL",
    peso: "SO_A_IDEIA",
  });
  return { conta, produtoId };
}

async function gerarFichas(doce: { conta: { id: string }; produtoId: string; provaNumero: string }, clinica: { conta: { id: string }; produtoId: string }) {
  definirClienteIA(clienteIADemo({ PROVA_1: doce.provaNumero }));
  for (const alvo of [doce, clinica]) {
    const r = await solicitarGeracaoFicha(alvo.conta.id, alvo.produtoId);
    if (!r.ok) throw new Error(`Não foi possível pedir a ficha: ${r.erro}`);
  }
  const lote = await executarLote();
  if (lote.concluidos < 2) throw new Error(`As fichas não foram geradas (${JSON.stringify(lote)}).`);

  // Doce Ateliê: revisa os blocos deduzidos e aprova.
  const db = obterDb();
  const ficha = await db.fichaProduto.findFirstOrThrow({ where: { produtoId: doce.produtoId }, orderBy: { versao: "desc" } });
  for (const bloco of blocosComInferido(lerFicha(ficha.conteudo)!)) {
    await marcarBlocoRevisado(doce.conta.id, doce.produtoId, ficha.id, bloco, true);
  }
  const aprovada = await aprovarFicha(doce.conta.id, doce.produtoId, ficha.id, EMAIL_DEMO);
  if (!aprovada.ok) throw new Error(`Não foi possível aprovar a ficha de demonstração: ${aprovada.erro}`);
}

/** Gastos de exemplo no mês (para a tela de Orçamento não ficar vazia). */
async function gastosDeExemplo(contas: string[]) {
  const [doce, clinica] = contas;
  for (const [contaId, saida] of [
    [doce, 380_000],
    [doce, 120_000],
    [clinica, 150_000],
  ] as const) {
    await registrarCusto({
      contaId,
      especialista: "demonstracao",
      provedor: "anthropic",
      modelo: MODELO_TEXTO_PADRAO,
      tipo: "TEXTO",
      uso: { tokensEntrada: 60_000, tokensSaida: saida },
    });
  }
}

async function main() {
  recusarAmbienteErrado();
  await limparDemoAnterior();
  await prepararGestorEOrcamento();
  const doce = await criarDoceAtelie();
  const clinica = await criarClinicaRespira();
  await gerarFichas(doce, clinica);
  await gastosDeExemplo([doce.conta.id, clinica.conta.id]);

  const base = process.env.APP_URL ?? "http://localhost:3000";
  const d = doce.conta.id;
  const c = clinica.conta.id;
  console.log(`
Dados de demonstração prontos (${r2Configurado() ? "imagens no R2 privado" : "imagens em .armazenamento-local/"}).

Login: ${EMAIL_DEMO} / ${SENHA_DEMO}  (só para ambiente local)

Telas:
  Contas ............................ ${base}/contas
  Doce Ateliê ....................... ${base}/contas/${d}
    Briefing etapa 1 a 5 ............ ${base}/contas/${d}/briefing?etapa=1  (troque o número: 1 a 5)
    Referências (concluídas) ........ ${base}/contas/${d}/briefing?etapa=5
    Ficha APROVADA .................. ${base}/contas/${d}/produtos/${doce.produtoId}/ficha
  Clínica Respira ................... ${base}/contas/${c}
    Referências (faltam artes) ...... ${base}/contas/${c}/briefing?etapa=5
    Ficha em revisão (com bloqueio) . ${base}/contas/${c}/produtos/${clinica.produtoId}/ficha
  Orçamento (divisão por conta) ..... ${base}/configuracoes/orcamento
  Avisos ............................ ${base}/notificacoes
`);
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => desconectarDb());
