import { describe, expect, it } from "vitest";
import { diaDoMes, diasNoMes, limitesDoMes, mesReferencia } from "./datas";

describe("datas no fuso de São Paulo", () => {
  it("31/10 23:30 em SP (01/11 02:30 UTC) ainda é outubro", () => {
    const instante = new Date("2026-11-01T02:30:00Z");
    expect(mesReferencia(instante)).toBe("2026-10");
    expect(diaDoMes(instante)).toBe(31);
  });

  it("01/11 00:00 em SP já é novembro", () => {
    expect(mesReferencia(new Date("2026-11-01T03:00:00Z"))).toBe("2026-11");
  });

  it("limites do mês em UTC", () => {
    const { inicio, fim } = limitesDoMes("2026-10");
    expect(inicio.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });

  it("virada de ano", () => {
    const { inicio, fim } = limitesDoMes("2026-12");
    expect(inicio.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    expect(fim.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });

  it("dias no mês", () => {
    expect(diasNoMes("2026-02")).toBe(28);
    expect(diasNoMes("2028-02")).toBe(29);
    expect(diasNoMes("2026-10")).toBe(31);
  });

  it("rejeita mês inválido", () => {
    expect(() => limitesDoMes("2026-1")).toThrow();
  });
});
