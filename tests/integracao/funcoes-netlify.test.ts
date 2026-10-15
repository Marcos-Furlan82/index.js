import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { enfileirarJob } from "@/jobs/fila";
import { obterDb } from "@/lib/db";
import { carregarFuncao, contextoFalso, listarFuncoes } from "./bundle-funcoes";

const SEGREDO = () => process.env.JOBS_SECRET!;

function requisicao(headers: Record<string, string> = {}) {
  return new Request("http://localhost/.netlify/functions/executar-jobs-background", {
    method: "POST",
    headers,
  });
}

/** Servidor local que faz o papel da Background Function (responde 202). */
async function servidorExecutor() {
  const recebidas: { url?: string; headers: IncomingHttpHeaders }[] = [];
  const servidor = createServer((req, res) => {
    recebidas.push({ url: req.url, headers: req.headers });
    res.statusCode = 202;
    res.end();
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", r));
  const { port } = servidor.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    recebidas,
    fechar: () => new Promise<void>((r) => servidor.close(() => r())),
  };
}

describe("bundle das funções do Netlify (como o Netlify empacota)", () => {
  it("empacota e carrega todas as funções", async () => {
    const nomes = await listarFuncoes();
    expect(nomes.sort()).toEqual(["despachar-jobs", "executar-jobs-background"]);
    for (const nome of nomes) {
      const modulo = await carregarFuncao(nome);
      expect(typeof modulo.default).toBe("function");
    }
  });

  it("executar-jobs-background recusa sem segredo, com segredo curto ou errado", async () => {
    const modulo = await carregarFuncao("executar-jobs-background");
    const variantes: Record<string, string>[] = [{}, { "x-segredo-jobs": "curto" }, { "x-segredo-jobs": `${SEGREDO()}x` }];
    for (const headers of variantes) {
      const resposta = (await modulo.default(requisicao(headers), contextoFalso())) as Response;
      expect(resposta.status).toBe(401);
    }
  });

  it("executar-jobs-background com segredo executa o ping", async () => {
    const job = await enfileirarJob({ tipo: "ping", payload: { origem: "bundle" } });
    const modulo = await carregarFuncao("executar-jobs-background");
    const resposta = (await modulo.default(
      requisicao({ "x-segredo-jobs": SEGREDO() }),
      contextoFalso(),
    )) as Response;
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toMatchObject({ concluidos: 1 });
    const final = await obterDb().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(final.status).toBe("CONCLUIDO");
  });

  it("despachar-jobs dispara a Background Function para os vencidos (até o paralelismo)", async () => {
    for (let i = 0; i < 3; i++) await enfileirarJob({ tipo: "ping", payload: {} });
    const executor = await servidorExecutor();
    try {
      const modulo = await carregarFuncao("despachar-jobs");
      expect(modulo.config).toMatchObject({ schedule: "*/2 * * * *" });
      const resposta = (await modulo.default(
        new Request("http://localhost/.netlify/functions/despachar-jobs", {
          method: "POST",
          body: JSON.stringify({ next_run: new Date().toISOString() }),
        }),
        contextoFalso(executor.url),
      )) as Response;
      expect(resposta.status).toBe(200);
      expect(await resposta.json()).toMatchObject({ vencidos: 3, disparados: 2 });
      expect(executor.recebidas).toHaveLength(2);
      for (const r of executor.recebidas) {
        expect(r.url).toBe("/.netlify/functions/executar-jobs-background");
        expect(r.headers["x-segredo-jobs"]).toBe(SEGREDO());
      }
    } finally {
      await executor.fechar();
    }
  });
});
