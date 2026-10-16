import { describe, expect, it } from "vitest";
import { verificarAlertas } from "@/custos/alertas";
import { podeGastar, resumoDoMes } from "@/custos/orcamento";
import { registrarCusto } from "@/custos/registrar";
import { obterDb } from "@/lib/db";

const db = () => obterDb();
// 15/10/2026 12:00 em São Paulo.
const AGORA = new Date("2026-10-15T15:00:00Z");

async function configurar(opcoes: { cotacao?: string | null; teto?: string; email?: string | null; preco?: boolean } = {}) {
  await db().configuracao.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
  await db().configuracao.update({
    where: { id: "global" },
    data: {
      cotacaoUsdBrl: opcoes.cotacao === undefined ? "5" : opcoes.cotacao,
      cotacaoAtualizadaEm: new Date(),
      tetoMensalBrl: opcoes.teto ?? "1000",
      emailNotificacao: opcoes.email === undefined ? "gestor@exemplo.com" : opcoes.email,
    },
  });
  if (opcoes.preco !== false) {
    await db().precoModelo.create({
      data: { provedor: "anthropic", modelo: "modelo-texto", usdPorMTokEntrada: "10", usdPorMTokSaida: "50" },
    });
    await db().precoModelo.create({ data: { provedor: "google", modelo: "modelo-imagem", usdPorImagem: "1" } });
  }
}

/** Gera custo de exatamente `brl` reais (cotação 5, US$ 1 por imagem). */
async function gastar(brl: number, extra: { contaId?: string; agora?: Date } = {}) {
  return registrarCusto(
    { provedor: "google", modelo: "modelo-imagem", tipo: "IMAGEM", uso: { imagens: brl / 5 }, contaId: extra.contaId },
    db(),
    extra.agora ?? AGORA,
  );
}

describe("registrarCusto", () => {
  it("calcula em USD e BRL, guarda a foto dos preços e o mês em SP", async () => {
    await configurar();
    const g = await registrarCusto(
      { provedor: "anthropic", modelo: "modelo-texto", tipo: "TEXTO", uso: { tokensEntrada: 1000, tokensSaida: 2000 } },
      db(),
      new Date("2026-11-01T02:30:00Z"), // 31/10 23:30 em SP
    );
    expect(g.mesReferencia).toBe("2026-10");
    expect(g.custoUsd?.toString()).toBe("0.11");
    expect(g.custoBrl?.toString()).toBe("0.55");
    expect(g.cotacaoUsada?.toString()).toBe("5");
    expect(g.precoPendente).toBe(false);
    expect(g.precosAplicados).toMatchObject({ usdPorMTokEntrada: "10", usdPorMTokSaida: "50" });
  });

  it("sem preço do modelo: custo nulo e precoPendente", async () => {
    await configurar();
    const g = await registrarCusto(
      { provedor: "x", modelo: "desconhecido", tipo: "TEXTO", uso: { tokensEntrada: 10 } },
      db(),
      AGORA,
    );
    expect(g).toMatchObject({ custoUsd: null, custoBrl: null, precoPendente: true });
  });

  it("sem cotação: custo nulo e precoPendente", async () => {
    await configurar({ cotacao: null });
    const g = await gastar(10);
    expect(g).toMatchObject({ custoBrl: null, precoPendente: true });
  });
});

describe("resumoDoMes", () => {
  it("totais, por tipo, por conta, projeção e gerações sem preço", async () => {
    await configurar();
    const conta = await db().contaInstagram.create({ data: { nome: "Conta A", tetoMensalBrl: "400" } });
    await gastar(100, { contaId: conta.id });
    await gastar(50);
    await registrarCusto(
      { provedor: "anthropic", modelo: "modelo-texto", tipo: "TEXTO", uso: { tokensSaida: 400_000 } },
      db(),
      AGORA,
    ); // 20 USD = 100 BRL
    await registrarCusto({ provedor: "x", modelo: "y", tipo: "VIDEO", uso: { segundosVideo: 8 } }, db(), AGORA);
    await gastar(500, { agora: new Date("2026-09-20T12:00:00Z") }); // outro mês

    const r = await resumoDoMes(db(), AGORA);
    expect(r.mes).toBe("2026-10");
    expect(r.gastoBrl.toString()).toBe("250");
    expect(r.percentual.toString()).toBe("25");
    expect(r.saldoBrl.toString()).toBe("750");
    expect(r.porTipo.IMAGEM.toString()).toBe("150");
    expect(r.porTipo.TEXTO.toString()).toBe("100");
    expect(r.porTipo.VIDEO.toString()).toBe("0");
    expect(r.porConta.find((c) => c.contaId === conta.id)).toMatchObject({ nome: "Conta A" });
    expect(r.porConta.find((c) => c.contaId === conta.id)?.tetoBrl?.toString()).toBe("400");
    // dia 15 de 31: 250 / 15 × 31
    expect(r.projecao.valorBrl.toFixed(2)).toBe("516.67");
    expect(r.projecao.poucoConfiavel).toBe(false);
    expect(r.geracoesSemPreco).toBe(1);
    expect(r.configurado).toBe(true);
    expect(r.cotacaoDesatualizada).toBe(false);
  });

  it("no início do mês a projeção é pouco confiável", async () => {
    await configurar();
    const r = await resumoDoMes(db(), new Date("2026-10-02T15:00:00Z"));
    expect(r.projecao.poucoConfiavel).toBe(true);
  });
});

describe("podeGastar", () => {
  it("sem cotação ou sem preços: orcamento_nao_configurado", async () => {
    await configurar({ cotacao: null });
    expect(await podeGastar(null, "1", db(), AGORA)).toMatchObject({
      permitido: false,
      motivo: "orcamento_nao_configurado",
    });
    await db().configuracao.update({ where: { id: "global" }, data: { cotacaoUsdBrl: "5" } });
    await db().precoModelo.deleteMany();
    expect((await podeGastar(null, "1", db(), AGORA)).motivo).toBe("orcamento_nao_configurado");
  });

  it("conta sem cota usa só o teto geral", async () => {
    await configurar();
    const conta = await db().contaInstagram.create({ data: { nome: "Sem cota" } });
    await gastar(900, { contaId: conta.id });
    const ok = await podeGastar(conta.id, "100", db(), AGORA);
    expect(ok).toMatchObject({ permitido: true, acao: "PARAR_GERACAO" });
    expect(ok.saldoGeralBrl.toString()).toBe("100");
    expect(ok.saldoContaBrl).toBeUndefined();
    expect(await podeGastar(conta.id, "100.01", db(), AGORA)).toMatchObject({ permitido: false, motivo: "teto_geral" });
  });

  it("cota da conta estourada bloqueia mesmo com saldo geral", async () => {
    await configurar();
    const conta = await db().contaInstagram.create({ data: { nome: "Com cota", tetoMensalBrl: "300" } });
    await gastar(250, { contaId: conta.id });
    const r = await podeGastar(conta.id, "60", db(), AGORA);
    expect(r).toMatchObject({ permitido: false, motivo: "teto_conta" });
    expect(r.saldoContaBrl?.toString()).toBe("50");
    expect((await podeGastar(conta.id, "50", db(), AGORA)).permitido).toBe(true);
    // Outra conta sem cota segue liberada.
    expect((await podeGastar(null, "60", db(), AGORA)).permitido).toBe(true);
  });

  it("devolve a ação configurada e as gerações sem preço", async () => {
    await configurar({ teto: "100" });
    await db().configuracao.update({ where: { id: "global" }, data: { acaoAoAtingirTeto: "PRIORIZAR_BARATOS" } });
    await gastar(100);
    await registrarCusto({ provedor: "x", modelo: "y", tipo: "TEXTO", uso: { tokensEntrada: 1 } }, db(), AGORA);
    expect(await podeGastar(null, "0.01", db(), AGORA)).toMatchObject({
      permitido: false,
      motivo: "teto_geral",
      acao: "PRIORIZAR_BARATOS",
      geracoesSemPreco: 1,
    });
  });
});

describe("alertas de orçamento", () => {
  const contar = async () => ({
    alertas: await db().alertaOrcamento.count(),
    jobs: await db().job.count({ where: { tipo: "enviar-email" } }),
  });

  it("50% e 80% geram 2 alertas e 2 e-mails; repetir não gera nada; mês novo zera", async () => {
    await configurar();
    await gastar(850); // 85%
    expect(await contar()).toEqual({ alertas: 2, jobs: 2 });
    const job = await db().job.findFirstOrThrow({ where: { chaveIdempotencia: "alerta:2026-10:geral:80" } });
    expect(job.payload).toMatchObject({ para: "gestor@exemplo.com", modelo: "alerta-orcamento", dados: { limiar: 80 } });

    await gastar(10);
    expect(await verificarAlertas("2026-10")).toEqual([]);
    expect(await contar()).toEqual({ alertas: 2, jobs: 2 });

    await gastar(200); // passa de 100%
    expect(await contar()).toEqual({ alertas: 3, jobs: 3 });

    await gastar(10, { agora: new Date("2026-11-10T12:00:00Z") });
    expect(await db().alertaOrcamento.count({ where: { mesReferencia: "2026-11" } })).toBe(0);
  });

  it("sem e-mail de notificação: só o alerta no painel", async () => {
    await configurar({ email: null });
    await gastar(600);
    expect(await contar()).toEqual({ alertas: 1, jobs: 0 });
  });

  it("5 verificações concorrentes: 2 alertas e 2 e-mails", async () => {
    await configurar();
    await db().configuracao.update({ where: { id: "global" }, data: { emailNotificacao: null } });
    await gastar(850); // sem e-mail: cria alertas sem jobs
    await db().alertaOrcamento.deleteMany();
    await db().configuracao.update({ where: { id: "global" }, data: { emailNotificacao: "gestor@exemplo.com" } });
    const resultados = await Promise.all(Array.from({ length: 5 }, () => verificarAlertas("2026-10")));
    expect(resultados.flat().sort()).toEqual([50, 80]);
    expect(await contar()).toEqual({ alertas: 2, jobs: 2 });
  });
});

describe("alertas e divisão por conta", () => {
  it("conta com cota recebe alertas próprios (uma vez por mês), com o nome da conta no e-mail", async () => {
    await configurar();
    const conta = await db().contaInstagram.create({ data: { nome: "Doce Ateliê", tetoMensalBrl: "100" } });
    const semCota = await db().contaInstagram.create({ data: { nome: "Sem cota" } });
    await gastar(60, { contaId: conta.id }); // 60% da cota, 6% do geral
    await gastar(60, { contaId: semCota.id });
    const alertas = await db().alertaOrcamento.findMany();
    expect(alertas.map((a) => `${a.escopo}:${a.limiar}`)).toEqual([`${conta.id}:50`]);
    const job = await db().job.findFirstOrThrow({ where: { chaveIdempotencia: `alerta:2026-10:${conta.id}:50` } });
    expect(job.payload).toMatchObject({ dados: { nomeConta: "Doce Ateliê", escopo: conta.id, tetoBrl: "100.00" } });
    await gastar(1, { contaId: conta.id });
    expect(await db().alertaOrcamento.count()).toBe(1);
  });

  it("resumo traz reservado, divisão por conta (sem arquivadas) e soma das cotas", async () => {
    await configurar();
    const a = await db().contaInstagram.create({ data: { nome: "A", tetoMensalBrl: "700" } });
    await db().contaInstagram.create({ data: { nome: "B", tetoMensalBrl: "500" } });
    await db().contaInstagram.create({ data: { nome: "Velha", tetoMensalBrl: "50", arquivadaEm: new Date() } });
    await gastar(70, { contaId: a.id });
    await db().reservaOrcamento.create({
      data: { contaId: a.id, mesReferencia: "2026-10", valorBrl: "3", origem: "job:x", expiraEm: new Date(AGORA.getTime() + 60_000) },
    });
    const r = await resumoDoMes(db(), AGORA);
    expect(r.reservadoBrl.toString()).toBe("3");
    expect(r.divisao.map((c) => c.nome)).toEqual(["A", "B"]);
    expect(r.divisao[0]).toMatchObject({ contaId: a.id });
    expect(r.divisao[0].percentual?.toString()).toBe("10");
    expect(r.divisao[0].reservadoBrl.toString()).toBe("3");
    expect(r.somaCotasBrl.toString()).toBe("1200");
  });
});
