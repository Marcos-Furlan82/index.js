import { describe, expect, it } from "vitest";
import { carregarFuncao, contextoFalso, listarFuncoes } from "./bundle-funcoes";

describe("bundle das funções do Netlify", () => {
  it("empacota todas as funções e carrega o client do Prisma gerado", async () => {
    const nomes = await listarFuncoes();
    expect(nomes.length).toBeGreaterThan(0);
    for (const nome of nomes) {
      const modulo = await carregarFuncao(nome);
      expect(typeof modulo.default).toBe("function");
    }
  });

  it("despachar-jobs consulta o banco a partir do bundle", async () => {
    const modulo = await carregarFuncao("despachar-jobs");
    expect(modulo.config).toMatchObject({ schedule: "*/2 * * * *" });
    const resposta = await modulo.default(
      new Request("http://localhost/.netlify/functions/despachar-jobs", {
        method: "POST",
        body: JSON.stringify({ next_run: new Date().toISOString() }),
      }),
      contextoFalso(),
    );
    expect(resposta).toBeInstanceOf(Response);
    expect((resposta as Response).status).toBe(200);
  });
});
