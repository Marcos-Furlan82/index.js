import { describe, expect, it } from "vitest";
import { atrasoParaErro, BACKOFF_MAX_MS, calcularAtrasoMs } from "./backoff";
import { ErroComEspera } from "./erros";

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

describe("espera mínima pedida pelo erro", () => {
  it("usa o maior entre o backoff e a espera do ErroComEspera", () => {
    expect(atrasoParaErro(1, new ErroComEspera("429", 90_000), meio)).toBe(90_000);
    expect(atrasoParaErro(3, new ErroComEspera("429", 1_000), meio)).toBe(120_000);
    expect(atrasoParaErro(1, new Error("x"), meio)).toBe(30_000);
  });
});
