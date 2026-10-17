import { BadRequestError } from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { solicitarGeracaoFicha, tentarDeNovoFicha } from "@/especialistas/produto/fichas";
import { gerarFichaProduto } from "@/especialistas/produto/gerar";
import { definirClienteIA } from "@/ia";
import { MODELO_TEXTO_PADRAO } from "@/ia/config";
import { ErroIA, ErroLimiteSaidaIA, ErroRecusaIA } from "@/ia/erros";
import { executarLote } from "@/jobs/executor";
import { obterDb } from "@/lib/db";
import { clienteFalso, configurarOrcamento, contaComBriefing, USO_PADRAO } from "./ajudantes-ficha";

const db = () => obterDb();

afterEach(() => definirClienteIA(undefined));

async function solicitar(contaId: string, produtoId: string, extra = {}) {
  const r = await solicitarGeracaoFicha(contaId, produtoId, extra);
  if (!r.ok) throw new Error(r.erro);
  return r.jobId;
}

const jobDe = (id: string) => db().job.findUniqueOrThrow({ where: { id } });

describe("geração da ficha do produto", () => {
  it("caminho feliz: reserva, chama a IA uma vez, registra o custo real, cria a versão 1 e avisa", async () => {
    await configurarOrcamento();
    const { conta, produtoId } = await contaComBriefing();
    const { cliente, pedidos } = clienteFalso();
    definirClienteIA(cliente);

    const jobId = await solicitar(conta.id, produtoId);
    expect((await db().produto.findUniqueOrThrow({ where: { id: produtoId } })).geracaoJobId).toBe(jobId);
    expect(await executarLote()).toMatchObject({ concluidos: 1, falhas: 0 });

    expect(pedidos).toHaveLength(1);
    expect(pedidos[0]).toMatchObject({ maxTokens: 16000, esforco: "medium" });
    const ficha = await db().fichaProduto.findFirstOrThrow({ where: { produtoId } });
    expect(ficha).toMatchObject({ versao: 1, status: "RASCUNHO", origem: "IA", jobId, modelo: MODELO_TEXTO_PADRAO, versaoPrompt: "produto-v1" });
    const reserva = await db().reservaOrcamento.findFirstOrThrow();
    expect(reserva).toMatchObject({ status: "CONCILIADA", contaId: conta.id, origem: `job:${jobId}` });
    const geracao = await db().geracaoIA.findFirstOrThrow();
    expect(geracao).toMatchObject({ reservaId: reserva.id, especialista: "produto", contaId: conta.id, tokensSaida: 2000, precoPendente: false });
    // 3000×4 + 2000×20 + 2500×5 = 64500 / 1e6 = US$ 0,0645 × 5
    expect(geracao.custoBrl?.toString()).toBe("0.3225");
    const aviso = await db().notificacao.findFirstOrThrow();
    expect(aviso).toMatchObject({ tipo: "ficha_pronta", contaId: conta.id, link: `/contas/${conta.id}/produtos/${produtoId}/ficha` });
    expect((await jobDe(jobId)).status).toBe("CONCLUIDO");
  });

  it("não enfileira de novo com geração em andamento (inclusive pedidos simultâneos)", async () => {
    await configurarOrcamento();
    const { conta, produtoId } = await contaComBriefing();
    const resultados = await Promise.all([1, 2, 3].map(() => solicitarGeracaoFicha(conta.id, produtoId)));
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.find((r) => !r.ok)).toMatchObject({ erro: expect.stringContaining("Já estamos montando") });
    expect(await db().job.count({ where: { tipo: "gerar-ficha-produto" } })).toBe(1);
  });

  it("recusa gerar com briefing incompleto, sem preço do modelo ou sem orçamento", async () => {
    const { conta, produtoId } = await contaComBriefing();
    expect(await solicitarGeracaoFicha(conta.id, produtoId)).toMatchObject({ ok: false, erro: expect.stringContaining("Cadastre o preço de: claude-opus-5-5") });
    await configurarOrcamento("0.01");
    expect(await solicitarGeracaoFicha(conta.id, produtoId)).toMatchObject({ ok: false, erro: expect.stringContaining("O orçamento de IA deste mês acabou") });
    await db().produto.update({ where: { id: produtoId }, data: { briefing: {} } });
    const r = await solicitarGeracaoFicha(conta.id, produtoId);
    expect(r).toMatchObject({ ok: false, irPara: "briefing" });
    expect(await db().job.count()).toBe(0);
  });

  it("repetir o mesmo job não chama a API de novo", async () => {
    await configurarOrcamento();
    const { conta, produtoId } = await contaComBriefing();
    const { cliente, pedidos } = clienteFalso();
    definirClienteIA(cliente);
    const jobId = await solicitar(conta.id, produtoId);
    await executarLote();
    const job = await jobDe(jobId);
    const r = await gerarFichaProduto(job.payload as never, { job, signal: new AbortController().signal }, { cliente });
    expect(r).toMatchObject({ versao: 1, repetido: true });
    expect(pedidos).toHaveLength(1);
  });

  it("orçamento esgotado na hora de executar: falha sem chamar a API e avisa", async () => {
    await configurarOrcamento();
    const { conta, produtoId } = await contaComBriefing();
    const { cliente, pedidos } = clienteFalso();
    definirClienteIA(cliente);
    const jobId = await solicitar(conta.id, produtoId);
    await db().configuracao.update({ where: { id: "global" }, data: { tetoMensalBrl: "0.01" } });
    await executarLote();
    const job = await jobDe(jobId);
    expect(job).toMatchObject({ status: "FALHOU", erro: "ErroPermanente: orcamento:teto_geral" });
    expect(pedidos).toHaveLength(0);
    expect(await db().reservaOrcamento.count()).toBe(0);
    expect(await db().notificacao.findFirstOrThrow()).toMatchObject({ tipo: "ficha_erro", mensagem: expect.stringContaining("orçamento de IA deste mês acabou") });
  });

  it("erro transitório antes de a IA responder libera a reserva e o job volta para a fila", async () => {
    await configurarOrcamento();
    const { conta, produtoId } = await contaComBriefing();
    definirClienteIA(
      clienteFalso(async () => {
        throw new ErroIA("sobrecarga", { permanente: false, cobrado: false });
      }).cliente,
    );
    const jobId = await solicitar(conta.id, produtoId);
    await executarLote();
    expect(await jobDe(jobId)).toMatchObject({ status: "PENDENTE", erro: "Error: ia:sobrecarga" });
    expect(await db().reservaOrcamento.findFirstOrThrow()).toMatchObject({ status: "LIBERADA" });
    expect(await db().geracaoIA.count()).toBe(0);
    expect(await db().notificacao.count()).toBe(0);
  });

  it("429 respeita a espera pedida", async () => {
    await configurarOrcamento();
    const { conta, produtoId } = await contaComBriefing();
    definirClienteIA(
      clienteFalso(async () => {
        throw new ErroIA("limite_taxa", { permanente: false, cobrado: false, esperaMs: 10 * 60_000 });
      }).cliente,
    );
    const jobId = await solicitar(conta.id, produtoId);
    const antes = Date.now();
    await executarLote();
    const job = await jobDe(jobId);
    expect(job).toMatchObject({ status: "PENDENTE", erro: "ErroComEspera: ia:limite_taxa" });
    expect(job.executarEm.getTime() - antes).toBeGreaterThanOrEqual(10 * 60_000 - 5_000);
  });

  it("recusa e limite de saída: falham de vez, mas o custo medido é registrado", async () => {
    await configurarOrcamento();
    for (const [erro, codigo, usuario] of [
      [new ErroRecusaIA([{ modelo: MODELO_TEXTO_PADRAO, uso: USO_PADRAO }]), "ia:recusa", "a"],
      [new ErroLimiteSaidaIA([{ modelo: MODELO_TEXTO_PADRAO, uso: USO_PADRAO }]), "ia:limite_saida", "b"],
    ] as const) {
      const { conta, produtoId } = await contaComBriefing({ usuario });
      definirClienteIA(
        clienteFalso(async () => {
          throw erro;
        }).cliente,
      );
      const jobId = await solicitar(conta.id, produtoId);
      await executarLote();
      expect(await jobDe(jobId)).toMatchObject({ status: "FALHOU", erro: `ErroPermanente: ${codigo}` });
      const reserva = await db().reservaOrcamento.findFirstOrThrow({ where: { contaId: conta.id } });
      expect(reserva.status).toBe("CONCILIADA");
      expect(await db().geracaoIA.count({ where: { reservaId: reserva.id } })).toBe(1);
      expect(await db().fichaProduto.count({ where: { produtoId } })).toBe(0);
      expect(await db().notificacao.count({ where: { contaId: conta.id, tipo: "ficha_erro" } })).toBe(1);
    }
  });

  it("erro no meio da resposta sem uso medido: a reserva fica ativa até expirar", async () => {
    await configurarOrcamento();
    const { conta, produtoId } = await contaComBriefing();
    definirClienteIA(
      clienteFalso(async () => {
        throw new ErroIA("conexao", { permanente: false, cobrado: true });
      }).cliente,
    );
    await solicitar(conta.id, produtoId);
    await executarLote();
    expect(await db().reservaOrcamento.findFirstOrThrow()).toMatchObject({ status: "ATIVA" });
  });

  it("tentar de novo reabre o mesmo job; outra versão depois da falha cria um job novo com a instrução", async () => {
    await configurarOrcamento();
    const { conta, produtoId } = await contaComBriefing();
    let falhar = true;
    const { cliente, pedidos } = clienteFalso(async () => {
      if (falhar) throw new ErroIA("requisicao_invalida", { permanente: true, cobrado: false });
      return { dados: (await import("@/especialistas/produto/teste-fixtures")).saidaExemplo(), usos: [], modelo: MODELO_TEXTO_PADRAO, fallbackUsado: false };
    });
    definirClienteIA(cliente);
    const jobId = await solicitar(conta.id, produtoId);
    await executarLote();
    expect((await jobDe(jobId)).status).toBe("FALHOU");
    falhar = false;
    expect(await tentarDeNovoFicha(conta.id, produtoId)).toBe(true);
    await executarLote();
    expect((await jobDe(jobId)).status).toBe("CONCLUIDO");
    expect(await db().fichaProduto.count()).toBe(1);

    const novo = await solicitar(conta.id, produtoId, { instrucao: "Deixe a promessa mais curta", baseVersao: 1 });
    expect(novo).not.toBe(jobId);
    await executarLote();
    expect(pedidos.at(-1)?.mensagem).toContain("Deixe a promessa mais curta");
    expect(pedidos.at(-1)?.mensagem).toContain("<ficha_anterior>");
    const v2 = await db().fichaProduto.findFirstOrThrow({ where: { produtoId, versao: 2 } });
    expect(v2).toMatchObject({ instrucao: "Deixe a promessa mais curta", baseVersao: 1, origem: "IA" });
  });

  it("execução órfã: duas execuções do mesmo job criam uma ficha só e um aviso só", async () => {
    await configurarOrcamento();
    const { conta, produtoId } = await contaComBriefing();
    const { cliente, pedidos } = clienteFalso();
    const jobId = await solicitar(conta.id, produtoId);
    const job = await jobDe(jobId);
    const ctx = { job, signal: new AbortController().signal };
    const resultados = await Promise.all([
      gerarFichaProduto(job.payload as never, ctx, { cliente }),
      gerarFichaProduto(job.payload as never, ctx, { cliente }),
    ]);
    expect(pedidos).toHaveLength(2);
    expect(resultados.map((r) => r.versao)).toEqual([1, 1]);
    expect(await db().fichaProduto.count()).toBe(1);
    expect(await db().notificacao.count({ where: { tipo: "ficha_pronta" } })).toBe(1);
    expect(await db().geracaoIA.count()).toBe(2);
  });

  it("execução órfã com reserva já expirada: o custo é registrado mesmo assim", async () => {
    await configurarOrcamento();
    const { conta, produtoId } = await contaComBriefing();
    const jobId = await solicitar(conta.id, produtoId);
    const job = await jobDe(jobId);
    const { cliente } = clienteFalso(async () => {
      await db().reservaOrcamento.updateMany({ data: { status: "EXPIRADA" } });
      return {
        dados: (await import("@/especialistas/produto/teste-fixtures")).saidaExemplo(),
        usos: [{ modelo: MODELO_TEXTO_PADRAO, uso: USO_PADRAO }],
        modelo: MODELO_TEXTO_PADRAO,
        fallbackUsado: false,
      };
    });
    await gerarFichaProduto(job.payload as never, { job, signal: new AbortController().signal }, { cliente });
    expect(await db().reservaOrcamento.findFirstOrThrow()).toMatchObject({ status: "CONCILIADA" });
    expect(await db().geracaoIA.count()).toBe(1);
  });

  it("nenhum dado do briefing ou da instrução vai para Job.erro ou para o log", async () => {
    const MARCADOR = "SEGREDO-BRIEFING-123";
    await configurarOrcamento();
    const falhas: (() => never)[] = [
      () => {
        throw new ErroIA("saida_invalida", { permanente: true, cobrado: true, usos: [] });
      },
      () => {
        throw new SyntaxError(`Unexpected token in JSON at position 3: "${MARCADOR}"`);
      },
      () => {
        throw Object.assign(new Error(`Argument descricao: ${MARCADOR}`), { name: "PrismaClientValidationError" });
      },
      () => {
        throw new BadRequestError(400, {}, `invalid request ${MARCADOR}`, new Headers());
      },
      () => {
        throw new Error(`qualquer coisa ${MARCADOR}`);
      },
    ];
    const anterior = process.env.LOG_SILENCIOSO;
    process.env.LOG_SILENCIOSO = "0";
    const saidas: string[] = [];
    const espioes = (["log", "warn", "error"] as const).map((n) =>
      vi.spyOn(console, n).mockImplementation((...args: unknown[]) => void saidas.push(args.map(String).join(" "))),
    );
    try {
      for (const [i, falha] of falhas.entries()) {
        const { conta, produtoId } = await contaComBriefing({ usuario: `conta${i}`, marcador: MARCADOR });
        definirClienteIA(clienteFalso(async () => falha()).cliente);
        const jobId = await solicitar(conta.id, produtoId, { instrucao: `mude ${MARCADOR}`, baseVersao: undefined });
        await executarLote();
        const job = await jobDe(jobId);
        expect(job.erro ?? "", `falha ${i}`).not.toContain(MARCADOR);
        expect(job.erro).toBeTruthy();
      }
      expect(saidas.length).toBeGreaterThan(0);
      expect(saidas.join("\n")).not.toContain(MARCADOR);
    } finally {
      espioes.forEach((e) => e.mockRestore());
      process.env.LOG_SILENCIOSO = anterior;
    }
  });
});
