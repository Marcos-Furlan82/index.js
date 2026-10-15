import { describe, expect, it } from "vitest";
import {
  arredondar2,
  CASAS,
  formatarBRL,
  formatarDecimalBR,
  formatarPreco,
  parseValorBR,
  percentual,
} from "./dinheiro";

describe("parseValorBR", () => {
  it.each([
    ["1000", "1000"],
    ["1.000", "1000"],
    ["1.000,50", "1000.5"],
    ["1,5", "1.5"],
    ["0", "0"],
    [" 12,34 ", "12.34"],
    ["1.234.567,89", "1234567.89"],
  ])("aceita %s", (texto, esperado) => {
    const r = parseValorBR(texto, CASAS.brl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor.toString()).toBe(esperado);
  });

  it.each(["1.5", "1,000.50", "1.00", "1..000", "", "   ", "-1", "-1.000,00", "abc", "1,", ",5", "1.0000"])(
    "rejeita %j",
    (texto) => {
      expect(parseValorBR(texto, CASAS.brl).ok).toBe(false);
    },
  );

  it("respeita o máximo de casas", () => {
    expect(parseValorBR("1,234", CASAS.brl).ok).toBe(false);
    expect(parseValorBR("5,4321", CASAS.cotacao).ok).toBe(true);
    expect(parseValorBR("5,43219", CASAS.cotacao).ok).toBe(false);
    expect(parseValorBR("0,000125", CASAS.preco).ok).toBe(true);
    expect(parseValorBR("0,0001255", CASAS.preco).ok).toBe(false);
  });
});

describe("formatação e arredondamento", () => {
  it("arredonda meio para cima com 2 casas", () => {
    expect(arredondar2("1.005").toFixed(2)).toBe("1.01");
    expect(arredondar2("1.004999").toFixed(2)).toBe("1.00");
  });

  it("formata em reais", () => {
    expect(formatarBRL("1000.5")).toBe("R$ 1.000,50");
    expect(formatarBRL("0.125")).toBe("R$ 0,13");
    expect(formatarBRL("1234567.891")).toBe("R$ 1.234.567,89");
    expect(formatarDecimalBR("5.4321", 4)).toBe("5,4321");
    expect(formatarDecimalBR("-12.5", 2)).toBe("-12,50");
  });

  it("formata preço unitário sem zeros sobrando", () => {
    expect(formatarPreco("15")).toBe("15,00");
    expect(formatarPreco("0.04")).toBe("0,04");
    expect(formatarPreco("0.000125")).toBe("0,000125");
    expect(formatarPreco("1.5")).toBe("1,50");
  });

  it("calcula percentual sem float", () => {
    expect(percentual("500", "1000").toString()).toBe("50");
    expect(percentual("1", "3").toFixed(2)).toBe("33.33");
    expect(percentual("10", "0").toString()).toBe("0");
  });
});
