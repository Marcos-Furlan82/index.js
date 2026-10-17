import { describe, expect, it } from "vitest";
import { esquemaFicha } from "./esquema";
import {
  acharPalavrasProibidas,
  bloqueiosAprovacao,
  blocosComInferido,
  contextoRegras,
  ctaEsperado,
  posProcessarFicha,
  recalcularPendencias,
  REGRAS_NICHO,
} from "./regras";
import { contextoExemplo, PROVA_AUTORIZADA, saidaExemplo } from "./teste-fixtures";

describe("palavras proibidas", () => {
  it("ignora maiúsculas e acentos e só pega a palavra inteira", () => {
    expect(acharPalavrasProibidas("É FACIL demais", ["fácil"])).toEqual(["fácil"]);
    expect(acharPalavrasProibidas("dificilmente", ["fácil", "difícil"])).toEqual([]);
    expect(acharPalavrasProibidas("resultado 100% garantido", ["100%", "garantido"])).toEqual(["100%", "garantido"]);
    expect(acharPalavrasProibidas("qualquer", ["", " "])).toEqual([]);
  });
});

describe("CTA esperado", () => {
  it("segue o objetivo e a isca", () => {
    expect(ctaEsperado("VENDAS", "TEM")).toBe("comprar");
    expect(ctaEsperado("AGENDA", null)).toBe("agendar");
    expect(ctaEsperado("LEADS", "TEM")).toBe("baixar_isca");
    expect(ctaEsperado("LEADS", "SUGESTAO")).toBe("baixar_isca");
    expect(ctaEsperado("LEADS", "SEM_ISCA")).toBe("chamar_dm");
    expect(ctaEsperado("SEGUIDORES", "TEM")).toBe("seguir");
    expect(ctaEsperado(null, null)).toBeNull();
  });
});

describe("pós-processamento da saída da IA", () => {
  it("copia só provas autorizadas, anula provaRef inexistente e junta as regras do setor", () => {
    const ficha = posProcessarFicha(saidaExemplo(), contextoExemplo(), "isca-1");
    expect(esquemaFicha.safeParse(ficha).success).toBe(true);
    expect(ficha.provas.map((p) => p.id)).toEqual([PROVA_AUTORIZADA]);
    expect(ficha.objecoes[0].provaRef).toBeNull();
    for (const regra of REGRAS_NICHO.CURSO) expect(ficha.naoPodePrometer).toContain(regra);
    expect(ficha.compliance.termosProibidos).toContain("fácil");
    expect(ficha).toMatchObject({ iscaId: "isca-1", principal: true, nicho: "CURSO" });
    // pendência da IA vira "melhora" com origem ia; a prova não autorizada vira aviso
    expect(ficha.pendencias).toContainEqual({ campo: "persona", pergunta: "Qual a cidade das alunas?", criticidade: "melhora", origem: "ia" });
    expect(ficha.pendencias.some((p) => p.pergunta.includes("1 prova sem autorização"))).toBe(true);
    expect(ficha.pendencias.every((p) => p.criticidade === "melhora")).toBe(true);
  });

  it("preço/forma vazios, palavra proibida e absolutos fora de 'não pode' bloqueiam; CTA divergente e +140 só melhoram", () => {
    const ficha = posProcessarFicha(
      saidaExemplo({
        oferta: { preco: "", formaCompra: " ", condicoes: "" },
        promessaCentral: `É fácil e 100% garantido. ${"x".repeat(140)}`,
        ctaPrincipal: { acao: "comprar", texto: "Compre", destino: "Link na bio" },
        naoPodePrometer: ["Resultado garantido"],
      }),
      contextoExemplo(),
      null,
    );
    const bloqueia = ficha.pendencias.filter((p) => p.criticidade === "bloqueia").map((p) => p.pergunta);
    expect(bloqueia).toEqual([
      "Qual é o preço do produto?",
      "Como a pessoa compra (site, WhatsApp, link de pagamento...)?",
      'Tirar a palavra proibida "fácil".',
      'Tirar "100%": só pode ser usado com prova.',
      'Tirar "garantido": só pode ser usado com prova.',
    ]);
    const melhora = ficha.pendencias.filter((p) => p.criticidade === "melhora" && p.origem === "regra").map((p) => p.campo);
    expect(melhora).toEqual(expect.arrayContaining(["ctaPrincipal", "promessaCentral"]));
  });

  it("sem provas autorizadas: pendência de melhora; ficha recalculada após edição perde o bloqueio", () => {
    const ctx = contextoExemplo();
    ctx.produto.briefing.provas = [];
    const ficha = posProcessarFicha(saidaExemplo({ oferta: { preco: "", formaCompra: "Hotmart", condicoes: "" } }), ctx, null);
    expect(ficha.pendencias.find((p) => p.campo === "provas")?.criticidade).toBe("melhora");
    expect(ficha.pendencias.some((p) => p.criticidade === "bloqueia")).toBe(true);
    const editada = recalcularPendencias({ ...ficha, oferta: { ...ficha.oferta, preco: "R$ 297" } }, contextoRegras(ctx));
    expect(editada.pendencias.some((p) => p.criticidade === "bloqueia")).toBe(false);
  });
});

describe("aprovação", () => {
  it("exige zero bloqueios e os blocos com campo inferido revisados", () => {
    const ficha = posProcessarFicha(saidaExemplo(), contextoExemplo(), null);
    expect(blocosComInferido(ficha)).toEqual(["promessa", "quemCompra"]);
    expect(bloqueiosAprovacao(ficha, [])).toEqual([
      'Marque "Revisei este bloco" em Promessa.',
      'Marque "Revisei este bloco" em Quem compra.',
    ]);
    expect(bloqueiosAprovacao(ficha, ["promessa", "quemCompra"])).toEqual([]);
  });
});
