import { describe, expect, it } from "vitest";
import { calcularCusto } from "./calcular";
import { projecaoDoMes } from "./orcamento";

const PRECOS = {
  usdPorMTokEntrada: "15",
  usdPorMTokSaida: "75",
  usdPorMTokCacheLeitura: "1.5",
  usdPorMTokCacheEscrita: "18.75",
  usdPorImagem: "0.04",
  usdPorSegundoVideo: "0.5",
};

describe("calcularCusto", () => {
  it("tokens por milhão, sem float", () => {
    const r = calcularCusto({ tokensEntrada: 1234, tokensSaida: 567 }, PRECOS, "5.4321");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 1234×15/1e6 + 567×75/1e6 = 0.01851 + 0.042525 = 0.061035
    expect(r.custoUsd.toString()).toBe("0.061035");
    expect(r.custoBrl.toString()).toBe("0.3315482235");
  });

  it("cache, imagens e segundos de vídeo", () => {
    const r = calcularCusto(
      { tokensCacheLeitura: 1_000_000, tokensCacheEscrita: 1_000_000, imagens: 3, segundosVideo: "8" },
      PRECOS,
      "5",
    );
    expect(r.ok && r.custoUsd.toString()).toBe("24.37"); // 1.5 + 18.75 + 0.12 + 4
    expect(r.ok && r.custoBrl.toString()).toBe("121.85");
  });

  it("preço faltando só importa se o item foi usado", () => {
    const soTexto = { usdPorMTokEntrada: "3", usdPorMTokSaida: "15" };
    expect(calcularCusto({ tokensEntrada: 10 }, soTexto, "5").ok).toBe(true);
    expect(calcularCusto({ imagens: 1 }, soTexto, "5")).toEqual({ ok: false, faltando: ["usdPorImagem"] });
    expect(calcularCusto({ tokensEntrada: 10 }, null, "5")).toEqual({ ok: false, faltando: ["usdPorMTokEntrada"] });
  });

  it("sem cotação não calcula", () => {
    expect(calcularCusto({ tokensEntrada: 10 }, PRECOS, null)).toEqual({ ok: false, faltando: ["cotacaoUsdBrl"] });
  });

  it("uso zerado custa zero", () => {
    const r = calcularCusto({}, PRECOS, "5");
    expect(r.ok && r.custoBrl.isZero()).toBe(true);
  });
});

describe("projeção do mês", () => {
  it("linear pelo dia do mês", () => {
    const p = projecaoDoMes("300", 15, 31);
    expect(p.valorBrl.toString()).toBe("620");
    expect(p.poucoConfiavel).toBe(false);
  });

  it("dias 1 a 3 são pouco confiáveis", () => {
    expect(projecaoDoMes("10", 1, 30).poucoConfiavel).toBe(true);
    expect(projecaoDoMes("10", 3, 30).poucoConfiavel).toBe(true);
    expect(projecaoDoMes("10", 4, 30).poucoConfiavel).toBe(false);
  });
});
