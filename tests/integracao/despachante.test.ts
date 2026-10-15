import { describe, expect, it, vi } from "vitest";
import { CAMINHO_EXECUTOR, despachar } from "@/jobs/despachante";
import { enfileirarJob } from "@/jobs/fila";
import { obterDb } from "@/lib/db";

const SEGREDO = "segredo-de-teste-com-mais-de-trinta-e-dois-caracteres";

function fetchFalso(resposta: () => Promise<Response>) {
  return vi.fn<typeof fetch>(() => resposta());
}

async function criarVencidos(n: number) {
  for (let i = 0; i < n; i++) await enfileirarJob({ tipo: "ping", payload: {} });
}

describe("despachar", () => {
  it("dispara min(vencidos, paralelismo - ativos) com o segredo", async () => {
    await criarVencidos(5);
    const f = fetchFalso(async () => new Response(null, { status: 202 }));
    const r = await despachar({ baseUrl: "https://site.exemplo", segredo: SEGREDO, paralelismo: 2, fetch: f });
    expect(r).toMatchObject({ vencidos: 5, ativos: 0, disparados: 2, falhasDisparo: 0 });
    expect(f).toHaveBeenCalledTimes(2);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(`https://site.exemplo${CAMINHO_EXECUTOR}`);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["x-segredo-jobs"]).toBe(SEGREDO);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("desconta executores ativos e não dispara sem vencidos", async () => {
    const f = fetchFalso(async () => new Response(null, { status: 202 }));
    expect((await despachar({ baseUrl: "https://s", segredo: SEGREDO, paralelismo: 2, fetch: f })).disparados).toBe(0);
    await criarVencidos(3);
    await obterDb().job.create({ data: { tipo: "ping", payload: {}, status: "EXECUTANDO", tentativas: 1, lockedAt: new Date() } });
    expect((await despachar({ baseUrl: "https://s", segredo: SEGREDO, paralelismo: 2, fetch: f })).disparados).toBe(1);
    await obterDb().job.create({ data: { tipo: "ping", payload: {}, status: "EXECUTANDO", tentativas: 1, lockedAt: new Date() } });
    const r = await despachar({ baseUrl: "https://s", segredo: SEGREDO, paralelismo: 2, fetch: f });
    expect(r).toMatchObject({ ativos: 2, disparados: 0 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("resposta diferente de 202 ou erro de rede não derrubam o despacho e não vazam o segredo", async () => {
    await criarVencidos(2);
    const erros = vi.spyOn(console, "error").mockImplementation(() => {});
    let i = 0;
    const f = fetchFalso(async () => {
      i++;
      if (i === 1) return new Response("erro", { status: 500 });
      throw new TypeError("fetch failed");
    });
    const r = await despachar({ baseUrl: "https://s", segredo: SEGREDO, paralelismo: 2, fetch: f });
    expect(r).toMatchObject({ disparados: 0, falhasDisparo: 2 });
    expect(erros).toHaveBeenCalledTimes(2);
    expect(erros.mock.calls.flat().join(" ")).not.toContain(SEGREDO);
    erros.mockRestore();
  });
});
