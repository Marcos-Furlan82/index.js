import { beforeEach, describe, expect, it } from "vitest";
import { destinoDoRedirect, requisicaoFalsa } from "./next-falso";
import { aprovarFichaAcao, editarBlocoAcao, marcarRevisadoAcao } from "@/app/(painel)/contas/[contaId]/produtos/[produtoId]/ficha/actions";
import { carregarContextoBriefing } from "@/briefing/salvar";
import { aprovarFicha, dispensarPendencia, editarBlocoFicha, marcarBlocoRevisado } from "@/especialistas/produto/fichas";
import { lerFicha } from "@/especialistas/produto/gerar";
import { chavePendencia, posProcessarFicha } from "@/especialistas/produto/regras";
import { saidaExemplo } from "@/especialistas/produto/teste-fixtures";
import { obterDb } from "@/lib/db";
import { entrarComoGestor } from "./ajudantes";
import { contaComBriefing } from "./ajudantes-ficha";

const db = () => obterDb();

beforeEach(() => requisicaoFalsa.limpar());

/** Versão 1 gerada "pela IA", com bloqueios: sem preço e palavra proibida na promessa. */
async function fichaComBloqueios() {
  const { conta, produtoId } = await contaComBriefing();
  const { ctx } = (await carregarContextoBriefing(conta.id, produtoId))!;
  const conteudo = posProcessarFicha(
    saidaExemplo({ oferta: { preco: "", formaCompra: "Hotmart", condicoes: "" }, promessaCentral: "Confeitaria fácil para vender" }),
    ctx,
    null,
  );
  const ficha = await db().fichaProduto.create({
    data: { produtoId, contaId: conta.id, versao: 1, origem: "IA", conteudo, modelo: "m", versaoPrompt: "produto-v1" },
  });
  return { conta, produtoId, ficha };
}

describe("revisão da ficha", () => {
  it("bloqueios só somem com edições (sem IA) e então a ficha é aprovada", async () => {
    const { conta, produtoId, ficha } = await fichaComBloqueios();
    const r1 = await aprovarFicha(conta.id, produtoId, ficha.id, "gestor@exemplo.com");
    expect(r1).toMatchObject({ ok: false });
    expect("motivos" in r1 && r1.motivos).toEqual([
      "Qual é o preço do produto?",
      'Tirar a palavra proibida "fácil".',
      'Marque "Revisei este bloco" em Promessa.',
      'Marque "Revisei este bloco" em Quem compra.',
    ]);

    const conteudo = lerFicha(ficha.conteudo)!;
    expect(await editarBlocoFicha(conta.id, produtoId, ficha.id, "oferta", { oferta: { ...conteudo.oferta, preco: "R$ 297,00" } })).toEqual({ ok: true, versao: 2 });
    const v2 = await db().fichaProduto.findFirstOrThrow({ where: { produtoId, versao: 2 } });
    expect(await editarBlocoFicha(conta.id, produtoId, v2.id, "promessa", { promessaCentral: "Doces de festa que vendem" })).toEqual({ ok: true, versao: 3 });
    const v3 = await db().fichaProduto.findFirstOrThrow({ where: { produtoId, versao: 3 } });
    expect(v3).toMatchObject({ origem: "EDICAO", baseVersao: 2, status: "RASCUNHO" });
    expect(v3.blocosRevisados.sort()).toEqual(["oferta", "promessa"]);
    const c3 = lerFicha(v3.conteudo)!;
    expect(c3.pendencias.filter((p) => p.criticidade === "bloqueia")).toEqual([]);
    expect(c3.confianca.find((c) => c.campo === "promessaCentral")?.nivel).toBe("informado");

    // Falta revisar "Quem compra" (deduzido pela IA).
    expect(await aprovarFicha(conta.id, produtoId, v3.id, "gestor@exemplo.com")).toMatchObject({ ok: false });
    expect(await marcarBlocoRevisado(conta.id, produtoId, v3.id, "quemCompra", true)).toMatchObject({ ok: true });
    expect(await aprovarFicha(conta.id, produtoId, v3.id, "gestor@exemplo.com")).toEqual({ ok: true, versao: 3 });
    expect(await db().fichaProduto.findUniqueOrThrow({ where: { id: v3.id } })).toMatchObject({ status: "APROVADA", aprovadaPor: "gestor@exemplo.com" });
  });

  it("editar tira as pendências da IA do bloco; versões antigas não podem ser alteradas", async () => {
    const { conta, produtoId, ficha } = await fichaComBloqueios();
    const c1 = lerFicha(ficha.conteudo)!;
    expect(c1.pendencias.some((p) => p.origem === "ia" && p.campo === "persona")).toBe(true);
    await editarBlocoFicha(conta.id, produtoId, ficha.id, "quemCompra", { persona: { ...c1.persona, perfil: "Mulheres que querem renda extra" } });
    const v2 = await db().fichaProduto.findFirstOrThrow({ where: { produtoId, versao: 2 } });
    expect(lerFicha(v2.conteudo)!.pendencias.some((p) => p.origem === "ia" && p.campo === "persona")).toBe(false);

    expect(await editarBlocoFicha(conta.id, produtoId, ficha.id, "promessa", { promessaCentral: "x" })).toMatchObject({ ok: false, erro: expect.stringContaining("mais nova") });
    expect(await marcarBlocoRevisado(conta.id, produtoId, ficha.id, "promessa", true)).toMatchObject({ ok: false });
    expect(await editarBlocoFicha(conta.id, produtoId, v2.id, "provas", {})).toMatchObject({ ok: false });
    expect(await editarBlocoFicha(conta.id, produtoId, v2.id, "promessa", { promessaCentral: 1 })).toMatchObject({ ok: false });
  });

  it("aprovar outra versão deixa a anterior SUBSTITUIDA", async () => {
    const { conta, produtoId, ficha } = await fichaComBloqueios();
    const c1 = lerFicha(ficha.conteudo)!;
    await editarBlocoFicha(conta.id, produtoId, ficha.id, "oferta", { oferta: { ...c1.oferta, preco: "297" } });
    let atual = await db().fichaProduto.findFirstOrThrow({ where: { produtoId, versao: 2 } });
    await editarBlocoFicha(conta.id, produtoId, atual.id, "promessa", { promessaCentral: "Doces que vendem" });
    atual = await db().fichaProduto.findFirstOrThrow({ where: { produtoId, versao: 3 } });
    await marcarBlocoRevisado(conta.id, produtoId, atual.id, "quemCompra", true);
    expect((await aprovarFicha(conta.id, produtoId, atual.id, "g")).ok).toBe(true);

    // Editar a aprovada cria uma nova em revisão; a aprovada continua até a próxima aprovação.
    await editarBlocoFicha(conta.id, produtoId, atual.id, "diferenciais", { diferencial: "Receitas testadas", diferenciaisSecundarios: [] });
    const v4 = await db().fichaProduto.findFirstOrThrow({ where: { produtoId, versao: 4 } });
    expect(v4.blocosRevisados).toEqual(expect.arrayContaining(["oferta", "promessa", "quemCompra", "diferenciais"]));
    expect((await db().fichaProduto.findUniqueOrThrow({ where: { id: atual.id } })).status).toBe("APROVADA");
    expect((await aprovarFicha(conta.id, produtoId, v4.id, "g")).ok).toBe(true);
    expect((await db().fichaProduto.findUniqueOrThrow({ where: { id: atual.id } })).status).toBe("SUBSTITUIDA");
    expect(await db().fichaProduto.count({ where: { produtoId, status: "APROVADA" } })).toBe(1);
  });

  it("só sugestões de melhora podem ser dispensadas", async () => {
    const { conta, produtoId, ficha } = await fichaComBloqueios();
    const pend = lerFicha(ficha.conteudo)!.pendencias;
    const melhora = pend.find((p) => p.criticidade === "melhora")!;
    const bloqueia = pend.find((p) => p.criticidade === "bloqueia")!;
    expect((await dispensarPendencia(conta.id, produtoId, ficha.id, chavePendencia(bloqueia))).ok).toBe(false);
    expect((await dispensarPendencia(conta.id, produtoId, ficha.id, chavePendencia(melhora))).ok).toBe(true);
    expect((await db().fichaProduto.findUniqueOrThrow({ where: { id: ficha.id } })).pendenciasDispensadas).toEqual([chavePendencia(melhora)]);
  });

  it("ações: sessão, produto de outra conta e conta arquivada", async () => {
    const { conta, produtoId, ficha } = await fichaComBloqueios();
    const pedido = { contaId: conta.id, produtoId, fichaId: ficha.id, bloco: "promessa", revisado: true };
    expect(await destinoDoRedirect(() => marcarRevisadoAcao(pedido))).toBe("/login");
    await entrarComoGestor();
    expect(await marcarRevisadoAcao(pedido)).toMatchObject({ ok: true });

    const outra = await contaComBriefing({ usuario: "outra" });
    expect(await marcarRevisadoAcao({ ...pedido, contaId: outra.conta.id })).toMatchObject({ ok: false });
    expect(await editarBlocoAcao({ ...pedido, contaId: outra.conta.id, valor: { promessaCentral: "x" } })).toMatchObject({ ok: false });
    // ficha de outro produto com o produto certo da outra conta
    expect(await editarBlocoAcao({ ...pedido, contaId: outra.conta.id, produtoId: outra.produtoId, valor: { promessaCentral: "x" } })).toMatchObject({
      ok: false,
      erro: "Ficha não encontrada.",
    });

    await db().contaInstagram.update({ where: { id: conta.id }, data: { arquivadaEm: new Date() } });
    const f = new FormData();
    f.set("contaId", conta.id);
    f.set("produtoId", produtoId);
    f.set("fichaId", ficha.id);
    expect((await aprovarFichaAcao({}, f)).erro).toBe("Conta ou produto não encontrado (ou arquivado).");
  });
});
