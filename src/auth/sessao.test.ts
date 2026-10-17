import { describe, expect, it } from "vitest";
import { hashToken, gerarToken, nomeCookieSessao, opcoesCookieSessao } from "./sessao";

describe("cookie de sessão", () => {
  it("produção usa __Host- com Secure, Path=/ e sem Domain", () => {
    const expira = new Date("2026-11-01T00:00:00Z");
    expect(nomeCookieSessao(true)).toBe("__Host-sessao");
    const opcoes = opcoesCookieSessao(expira, true);
    expect(opcoes).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: expira });
    expect(opcoes).not.toHaveProperty("domain");
  });

  it("desenvolvimento usa 'sessao' sem Secure", () => {
    expect(nomeCookieSessao(false)).toBe("sessao");
    expect(opcoesCookieSessao(new Date(), false).secure).toBe(false);
  });

  it("token tem 32 bytes e o banco guarda só o sha256", () => {
    const token = gerarToken();
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});
