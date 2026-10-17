import { describe, expect, it } from "vitest";
import { estimarMaximo, estimarTokens } from "./estimativa";

const PRECOS = [
  { modelo: "principal", usdPorMTokEntrada: "4", usdPorMTokSaida: "20", usdPorMTokCacheEscrita: "5" },
  { modelo: "fb1", usdPorMTokEntrada: "5", usdPorMTokSaida: "25", usdPorMTokCacheEscrita: null },
] as never;

describe("estimativa do custo máximo", () => {
  it("usa o maior preço entre principal e fallbacks, cache do sistema e 2 × max_tokens", () => {
    const r = estimarMaximo({
      sistema: "s".repeat(2500), // 1000 tokens
      mensagem: "m".repeat(2500), // 1000
      esquemaJson: "e".repeat(500), // 200
      maxTokens: 16000,
      modelos: ["principal", "fb1"],
      precos: PRECOS,
      cotacaoUsdBrl: "5",
    });
    if (!r.ok) throw new Error("esperava ok");
    // entrada 2200 × 5 + sistema 1000 × 6,25 (1,25 × 5 do fb1) + 32000 × 25 = 11000 + 6250 + 800000 = 817250 / 1e6
    expect(r.maximoUsd.toString()).toBe("0.81725");
    expect(r.maximoBrl.toString()).toBe("4.08625");
    expect(r.tokensEntrada).toBe(2200);
  });

  it("sem preço de algum modelo ou sem cotação não estima", () => {
    const base = { sistema: "s", mensagem: "m", esquemaJson: "{}", maxTokens: 100, precos: PRECOS };
    expect(estimarMaximo({ ...base, modelos: ["principal", "fb2"], cotacaoUsdBrl: "5" })).toEqual({ ok: false, motivo: "sem_preco", faltando: ["fb2"] });
    expect(estimarMaximo({ ...base, modelos: ["principal"], cotacaoUsdBrl: null })).toEqual({ ok: false, motivo: "sem_cotacao" });
  });

  it("tokens ≈ caracteres / 2,5 (arredonda para cima)", () => {
    expect(estimarTokens("abcde")).toBe(2);
    expect(estimarTokens("abcdef")).toBe(3);
  });
});
