import { describe, expect, it } from "vitest";
import { BACKOFF_MAX_MS, calcularAtrasoMs } from "./backoff";

const meio = () => 0.5; // fator 1

describe("backoff exponencial", () => {
  it("dobra a cada tentativa a partir de 30 s", () => {
    expect([1, 2, 3, 4].map((n) => calcularAtrasoMs(n, meio))).toEqual([30_000, 60_000, 120_000, 240_000]);
  });

  it("limita a 1 hora", () => {
    expect(calcularAtrasoMs(8, meio)).toBe(BACKOFF_MAX_MS);
    expect(calcularAtrasoMs(30, meio)).toBe(BACKOFF_MAX_MS);
  });

  it("varia ±20%", () => {
    expect(calcularAtrasoMs(1, () => 0)).toBe(24_000);
    expect(calcularAtrasoMs(1, () => 1)).toBe(36_000);
  });
});
