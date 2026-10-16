import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TIMEOUT_MAXIMO_MS, TIMEOUT_PADRAO_MS } from "./limites";
import { maiorTimeout, REGISTRO, validarRegistro } from "./registro";
import { definirJob } from "./tipos";

const def = (timeoutMs?: number, maxTentativas?: number) =>
  definirJob({ schema: z.object({}), executar: async () => null, timeoutMs, maxTentativas });

describe("registro de jobs", () => {
  it("o registro padrão é válido e tem o ping", () => {
    expect(REGISTRO.ping).toBeDefined();
    expect(maiorTimeout(REGISTRO)).toBeLessThanOrEqual(TIMEOUT_MAXIMO_MS);
  });

  it("o maior timeout do registro é o da ficha do produto (6 min): o executor só reivindica com 7 min livres", () => {
    expect(REGISTRO["gerar-ficha-produto"]).toBeDefined();
    expect(maiorTimeout(REGISTRO)).toBe(6 * 60_000);
  });

  it("rejeita timeout acima de 8 min ou não positivo", () => {
    expect(() => validarRegistro({ x: def(TIMEOUT_MAXIMO_MS + 1) })).toThrow(/timeoutMs/);
    expect(() => validarRegistro({ x: def(0) })).toThrow(/timeoutMs/);
    expect(() => validarRegistro({ x: def(TIMEOUT_MAXIMO_MS) })).not.toThrow();
  });

  it("rejeita maxTentativas < 1", () => {
    expect(() => validarRegistro({ x: def(undefined, 0) })).toThrow(/maxTentativas/);
  });

  it("maior timeout considera o padrão de 2 min", () => {
    expect(maiorTimeout({ a: def(1000) })).toBe(TIMEOUT_PADRAO_MS);
    expect(maiorTimeout({ a: def(1000), b: def(5 * 60_000) })).toBe(5 * 60_000);
  });
});
