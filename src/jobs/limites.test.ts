import { describe, expect, it } from "vitest";
import {
  LIMITE_INVOCACAO_MS,
  MARGEM_CLAIM_MS,
  PRAZO_RECUPERACAO_MS,
  TIMEOUT_MAXIMO_MS,
  TIMEOUT_PADRAO_MS,
} from "./limites";

describe("relação entre os limites de tempo", () => {
  it("prazo de recuperação = limite da invocação + 5 min", () => {
    expect(LIMITE_INVOCACAO_MS).toBe(15 * 60_000);
    expect(PRAZO_RECUPERACAO_MS).toBe(LIMITE_INVOCACAO_MS + 5 * 60_000);
  });

  it("um job reivindicado no último instante permitido termina antes do fim da invocação", () => {
    const ultimoClaim = LIMITE_INVOCACAO_MS - (TIMEOUT_MAXIMO_MS + MARGEM_CLAIM_MS);
    expect(ultimoClaim).toBeGreaterThan(0);
    expect(ultimoClaim + TIMEOUT_MAXIMO_MS).toBeLessThan(LIMITE_INVOCACAO_MS);
    // e nunca é dado como travado enquanto a invocação pode estar viva
    expect(PRAZO_RECUPERACAO_MS).toBeGreaterThan(LIMITE_INVOCACAO_MS);
  });

  it("timeout padrão de 2 min, máximo de 8 min", () => {
    expect(TIMEOUT_PADRAO_MS).toBe(2 * 60_000);
    expect(TIMEOUT_MAXIMO_MS).toBe(8 * 60_000);
  });
});
