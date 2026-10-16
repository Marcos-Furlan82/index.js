import { beforeEach, describe, expect, it } from "vitest";
import { destinoDoRedirect, requisicaoFalsa } from "./next-falso";
import { irParaEtapaAcao, salvarIscaAcao, salvarRespostasAcao } from "@/app/(painel)/contas/[contaId]/briefing/actions";
import { lerBriefingMarca, lerBriefingProduto } from "@/briefing/esquemas";
import { faltandoParaGerar } from "@/briefing/obrigatorios";
import { carregarContextoBriefing, salvarRespostasBriefing } from "@/briefing/salvar";
import { criarConta } from "@/contas/contas";
import { obterDb } from "@/lib/db";
import { entrarComoGestor } from "./ajudantes";

const db = () => obterDb();

async function novaConta(usuario = "doceatelie") {
  const r = await criarConta({ nome: "Doce Ateliê", usuarioInstagram: usuario });
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

beforeEach(() => requisicaoFalsa.limpar());

describe("briefing", () => {
  it("salvamentos simultâneos de campos diferentes não se perdem (merge no banco)", async () => {
    const conta = await novaConta();
    const p = conta.produtoPrincipalId!;
    await Promise.all([
      salvarRespostasBriefing({ contaId: conta.id, marca: { nicho: "CURSO" } }),
      salvarRespostasBriefing({ contaId: conta.id, marca: { objetivo90d: "VENDAS" } }),
      salvarRespostasBriefing({ contaId: conta.id, marca: { tomVoz: ["PROXIMO", "INSPIRADOR"] } }),
      salvarRespostasBriefing({ contaId: conta.id, produtoId: p, produto: { preco: "297,00" } }),
      salvarRespostasBriefing({ contaId: conta.id, produtoId: p, produto: { dor: "Não conseguem vender os doces" } }),
      salvarRespostasBriefing({ contaId: conta.id, produtoId: p, produto: { nome: "Curso Confeitaria que Vende" } }),
    ]);
    const marca = await db().marca.findUniqueOrThrow({ where: { contaId: conta.id } });
    expect(lerBriefingMarca(marca.briefing)).toEqual({ nicho: "CURSO", objetivo90d: "VENDAS", tomVoz: ["PROXIMO", "INSPIRADOR"] });
    expect(marca.briefingIniciadoEm).not.toBeNull();
    const produto = await db().produto.findUniqueOrThrow({ where: { id: p } });
    expect(produto.nome).toBe("Curso Confeitaria que Vende");
    expect(lerBriefingProduto(produto.briefing)).toEqual({ preco: "297,00", dor: "Não conseguem vender os doces" });
  });

  it("valida e recusa sem gravar nada", async () => {
    const conta = await novaConta();
    const p = conta.produtoPrincipalId!;
    expect(await salvarRespostasBriefing({ contaId: conta.id, produtoId: p, produto: { diferencial: "x".repeat(141) } })).toEqual({
      ok: false,
      erro: "Use no máximo 140 caracteres.",
    });
    expect((await salvarRespostasBriefing({ contaId: conta.id, marca: { links: ["javascript:alert(1)"] } })).ok).toBe(false);
    expect((await salvarRespostasBriefing({ contaId: conta.id, marca: { postsSemana: 20 } })).ok).toBe(false);
    expect((await salvarRespostasBriefing({ contaId: conta.id, produtoId: p, produto: { nome: " " } })).ok).toBe(false);
    const marca = await db().marca.findUniqueOrThrow({ where: { contaId: conta.id } });
    expect(marca.briefing).toEqual({});
  });

  it("actions: exigem sessão, recusam produto de outra conta e conta arquivada", async () => {
    const a = await novaConta("a");
    const b = await novaConta("b");
    const pedido = { contaId: a.id, produtoId: b.produtoPrincipalId!, etapa: 1, mudancas: { "produto.preco": "10" } };
    expect(await destinoDoRedirect(() => salvarRespostasAcao(pedido))).toBe("/login");
    await entrarComoGestor();
    expect((await salvarRespostasAcao(pedido)).ok).toBe(false);
    expect((await salvarIscaAcao({ contaId: a.id, produtoId: b.produtoPrincipalId!, isca: { escolha: "SEM_ISCA" } })).ok).toBe(false);
    expect((await salvarRespostasAcao({ ...pedido, mudancas: { "outra.coisa": 1 } })).ok).toBe(false);
    expect((await salvarRespostasAcao({ ...pedido, produtoId: a.produtoPrincipalId!, etapa: 3 })).ok).toBe(true);
    expect((await db().marca.findUniqueOrThrow({ where: { contaId: a.id } })).etapaAtual).toBe(3);

    await irParaEtapaAcao(a.id, 4);
    expect((await db().marca.findUniqueOrThrow({ where: { contaId: a.id } })).etapaAtual).toBe(4);

    await db().contaInstagram.update({ where: { id: a.id }, data: { arquivadaEm: new Date() } });
    expect((await salvarRespostasAcao({ ...pedido, produtoId: a.produtoPrincipalId! })).ok).toBe(false);
  });

  it("isca: os três caminhos", async () => {
    await entrarComoGestor();
    const conta = await novaConta();
    const produtoId = conta.produtoPrincipalId!;
    const salvar = (isca: unknown) => salvarIscaAcao({ contaId: conta.id, produtoId, isca });

    expect((await salvar({ escolha: "TEM", descricao: "Apostila", formato: "CHECKLIST_PDF", comoRecebe: "LINK_BIO", link: "javascript:x", pronta: true })).ok).toBe(false);
    expect(
      (await salvar({ escolha: "TEM", descricao: "Apostila", formato: "CHECKLIST_PDF", comoRecebe: "LINK_BIO", link: "https://x.com/a", pronta: false, previsaoPronta: "2026-11-01" })).ok,
    ).toBe(true);
    let isca = await db().isca.findUniqueOrThrow({ where: { produtoId } });
    expect(isca).toMatchObject({ escolha: "TEM", link: "https://x.com/a", pronta: false });
    expect(isca.previsaoPronta?.toISOString().slice(0, 10)).toBe("2026-11-01");

    expect((await salvar({ escolha: "SUGESTAO", sugestaoChave: "nao-existe" })).ok).toBe(false);
    expect((await salvar({ escolha: "SUGESTAO", sugestaoChave: "curso-aula" })).ok).toBe(true);
    isca = await db().isca.findUniqueOrThrow({ where: { produtoId } });
    expect(isca).toMatchObject({ escolha: "SUGESTAO", sugestaoChave: "curso-aula", descricao: "Aula grátis", formato: "AULA_VIDEO", pronta: false, comoRecebe: "LINK_BIO" });

    expect((await salvar({ escolha: "SEM_ISCA", descricao: "sobra" })).ok).toBe(true);
    isca = await db().isca.findUniqueOrThrow({ where: { produtoId } });
    expect(isca).toMatchObject({ escolha: "SEM_ISCA", descricao: null, formato: null, link: null });
  });

  it("faltandoParaGerar com dados reais do banco", async () => {
    const conta = await novaConta();
    const p = conta.produtoPrincipalId!;
    let dados = await carregarContextoBriefing(conta.id, p);
    expect(faltandoParaGerar(dados!.ctx)).toHaveLength(11);
    await salvarRespostasBriefing({
      contaId: conta.id,
      produtoId: p,
      marca: { nicho: "CURSO", objetivo90d: "LEADS", tomVoz: ["PROXIMO"] },
      produto: {
        nome: "Curso Confeitaria que Vende",
        descricao: "Curso online de confeitaria",
        preco: "297",
        formaCompra: "LINK_CHECKOUT",
        dor: "Não conseguem vender os doces",
        objecaoPrincipal: "Medo de não ter tempo",
        diferencial: "Receitas testadas",
      },
    });
    await db().isca.create({ data: { produtoId: p, escolha: "SEM_ISCA" } });
    dados = await carregarContextoBriefing(conta.id, p);
    expect(faltandoParaGerar(dados!.ctx)).toEqual([]);
  });
});
