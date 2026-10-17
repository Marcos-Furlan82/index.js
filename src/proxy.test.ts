import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

describe("proxy (checagem otimista de sessão)", () => {
  it("sem cookie redireciona para /login", () => {
    const resposta = proxy(new NextRequest("https://painel.exemplo.com/configuracoes/orcamento"));
    expect(resposta.status).toBe(307);
    expect(resposta.headers.get("location")).toBe("https://painel.exemplo.com/login");
  });

  it.each(["__Host-sessao", "sessao"])("com cookie %s deixa passar", (nome) => {
    const req = new NextRequest("https://painel.exemplo.com/", { headers: { cookie: `${nome}=abc` } });
    const resposta = proxy(req);
    expect(resposta.headers.get("location")).toBeNull();
    expect(resposta.headers.get("x-middleware-next")).toBe("1");
  });

  it("matcher não cobre login, APIs e estáticos", () => {
    const padrao = new RegExp(`^${config.matcher[0]}$`);
    expect(padrao.test("/")).toBe(true);
    expect(padrao.test("/configuracoes/sistema")).toBe(true);
    expect(padrao.test("/login")).toBe(false);
    expect(padrao.test("/api/saude")).toBe(false);
    expect(padrao.test("/_next/static/chunk.js")).toBe(false);
  });
});
