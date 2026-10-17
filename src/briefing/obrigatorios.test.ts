import { describe, expect, it } from "vitest";
import { lerBriefingMarca, esquemaRascunhoMarca, esquemaRascunhoProduto } from "./esquemas";
import { faltandoParaGerar, lerPreco, linkDoCampo, pendenciasDoBriefing, type ContextoBriefing } from "./obrigatorios";

const COMPLETO: ContextoBriefing = {
  contaId: "c1",
  principal: true,
  produto: {
    id: "p1",
    nome: "Curso Confeitaria que Vende",
    briefing: {
      descricao: "Curso online de confeitaria para vender",
      preco: "R$ 297,00",
      formaCompra: "LINK_CHECKOUT",
      dor: "Gastam com ingredientes e não vendem",
      objecaoPrincipal: "Medo de não ter tempo",
      diferencial: "Receitas testadas para vender",
      perfil: "Mulheres de 30 a 45",
      desejo: "Renda extra",
    },
  },
  marca: { nicho: "CURSO", objetivo90d: "VENDAS", tomVoz: ["PROXIMO"] },
  isca: { escolha: "SEM_ISCA", pronta: false },
};

describe("preço", () => {
  it("aceita formatos comuns e recusa o resto", () => {
    expect(lerPreco("R$ 297")?.toString()).toBe("297");
    expect(lerPreco("1.297,90")?.toString()).toBe("1297.9");
    expect(lerPreco("297.90")?.toString()).toBe("297.9");
    for (const ruim of ["", "grátis", "0", "-10", "1,2,3", null]) expect(lerPreco(ruim)).toBeNull();
  });
});

describe("o que falta para gerar a ficha", () => {
  it("briefing completo não tem faltantes", () => {
    expect(faltandoParaGerar(COMPLETO)).toEqual([]);
  });

  it("lista os críticos com link para a pergunta", () => {
    const f = faltandoParaGerar({
      ...COMPLETO,
      produto: { ...COMPLETO.produto, nome: "Produto principal", briefing: { ...COMPLETO.produto.briefing, preco: "a combinar", dor: "caro" } },
      marca: { nicho: "OUTRO" },
      isca: { escolha: "TEM", pronta: false, descricao: "Apostila" },
    });
    expect(f.map((x) => x.campo)).toEqual(["nome", "preco", "nicho", "dor", "objetivo90d", "isca", "tomVoz"]);
    expect(f.find((x) => x.campo === "preco")?.link).toBe("/contas/c1/briefing?etapa=1#campo-preco");
    expect(f.find((x) => x.campo === "isca")?.etapa).toBe(4);
  });

  it("produto secundário: perguntas do produto na página dele, as da conta no assistente", () => {
    const ctx = { ...COMPLETO, principal: false };
    expect(linkDoCampo(ctx, "diferencial")).toBe("/contas/c1/produtos/p1#campo-diferencial");
    expect(linkDoCampo(ctx, "tomVoz")).toBe("/contas/c1/briefing?etapa=4#campo-tomVoz");
  });

  it("isca sugerida exige a sugestão escolhida", () => {
    expect(faltandoParaGerar({ ...COMPLETO, isca: { escolha: "SUGESTAO", pronta: false } }).map((x) => x.campo)).toEqual(["isca"]);
    expect(faltandoParaGerar({ ...COMPLETO, isca: { escolha: "SUGESTAO", pronta: false, sugestaoChave: "curso-aula" } })).toEqual([]);
  });

  it("pendências de melhora do briefing", () => {
    const p = pendenciasDoBriefing({
      ...COMPLETO,
      produto: { ...COMPLETO.produto, briefing: { ...COMPLETO.produto.briefing, perfil: "" } },
      marca: { ...COMPLETO.marca, nicho: "TERAPIA_SAUDE" },
    });
    expect(p.map((x) => x.campo)).toEqual(["persona", "compliance"]);
  });
});

describe("esquemas do briefing", () => {
  it("rascunho recusa chave desconhecida, diferencial longo e link javascript:", () => {
    expect(esquemaRascunhoProduto.safeParse({ outra: 1 }).success).toBe(false);
    expect(esquemaRascunhoProduto.safeParse({ diferencial: "x".repeat(141) }).success).toBe(false);
    expect(esquemaRascunhoMarca.safeParse({ links: ["javascript:alert(1)"] }).success).toBe(false);
    expect(esquemaRascunhoMarca.safeParse({ links: ["https://instagram.com/x"] }).success).toBe(true);
    expect(esquemaRascunhoMarca.safeParse({ cores: [{ hex: "#12345", papel: "PRINCIPAL" }] }).success).toBe(false);
    expect(esquemaRascunhoMarca.safeParse({ nicho: null }).success).toBe(true);
  });

  it("provas com id repetido ou sem uuid são recusadas", () => {
    const prova = { id: "6f1c2a8e-1111-4222-8333-444455556666", tipo: "NUMERO", conteudo: "1.200 alunas", fonte: "", autorizadoUso: true };
    expect(esquemaRascunhoProduto.safeParse({ provas: [prova] }).success).toBe(true);
    expect(esquemaRascunhoProduto.safeParse({ provas: [prova, prova] }).success).toBe(false);
    expect(esquemaRascunhoProduto.safeParse({ provas: [{ ...prova, id: "1" }] }).success).toBe(false);
  });

  it("leitura tolerante ignora campos inválidos guardados", () => {
    expect(lerBriefingMarca({ nicho: "CURSO", postsSemana: 99, lixo: true, tomVoz: ["PROXIMO"] })).toEqual({
      nicho: "CURSO",
      tomVoz: ["PROXIMO"],
    });
    expect(lerBriefingMarca(null)).toEqual({});
  });
});
