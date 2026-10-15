import { describe, expect, it } from "vitest";
import { gerarHashSenha, validarForcaSenha, verificarSenha, verificarSenhaFicticia } from "./senha";

describe("senha (scrypt)", () => {
  it("gera hash verificável e com salt aleatório", async () => {
    const a = await gerarHashSenha("uma-senha-bem-longa");
    const b = await gerarHashSenha("uma-senha-bem-longa");
    expect(a).toMatch(/^scrypt\$131072\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(await verificarSenha("uma-senha-bem-longa", a)).toBe(true);
    expect(await verificarSenha("outra-senha-qualquer", a)).toBe(false);
  });

  it("rejeita hash malformado", async () => {
    expect(await verificarSenha("x", "md5$abc")).toBe(false);
  });

  it("hash fictício nunca confere", async () => {
    expect(await verificarSenhaFicticia("qualquer")).toBe(false);
  });

  it("exige 12+ caracteres", () => {
    expect(validarForcaSenha("curta")).not.toBeNull();
    expect(validarForcaSenha("123456789012")).toBeNull();
  });
});
