import { describe, expect, it } from "vitest";
import { normalizarNomeConta, normalizarUsuarioInstagram } from "./contas";

describe("normalizarUsuarioInstagram", () => {
  it("tira @ e espaços e põe em minúsculas", () => {
    expect(normalizarUsuarioInstagram(" @Doce.Atelie_ ")).toEqual({ ok: true, valor: "doce.atelie_" });
    expect(normalizarUsuarioInstagram("")).toEqual({ ok: true, valor: null });
    expect(normalizarUsuarioInstagram(null)).toEqual({ ok: true, valor: null });
  });

  it("recusa espaço, acento, traço e mais de 30 caracteres", () => {
    for (const ruim of ["doce atelie", "confeitária", "doce-atelie", "a".repeat(31), "@@"]) {
      expect(normalizarUsuarioInstagram(ruim).ok, ruim).toBe(ruim === "@@");
    }
    expect(normalizarUsuarioInstagram("a".repeat(30)).ok).toBe(true);
  });

  it("nome da conta obrigatório e curto", () => {
    expect(normalizarNomeConta("  Doce   Ateliê ")).toEqual({ ok: true, valor: "Doce Ateliê" });
    expect(normalizarNomeConta(" ").ok).toBe(false);
    expect(normalizarNomeConta("x".repeat(81)).ok).toBe(false);
  });
});
