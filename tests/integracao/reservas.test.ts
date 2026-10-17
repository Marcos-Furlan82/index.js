import { describe, expect, it } from "vitest";
import { comprometidoNoMes, podeGastar } from "@/custos/orcamento";
import { recalcularGeracoesSemPreco, registrarUsosEConciliar } from "@/custos/registrar";
import { expirarReservas, liberarReserva, reservarOrcamento } from "@/custos/reservas";
import { criarDb, obterDb } from "@/lib/db";

const db = () => obterDb();
const AGORA = new Date("2026-10-15T15:00:00Z");
const MIN = 60_000;

/** Cotação 5; "modelo-texto": US$ 10 / 50 por milhão (entrada/saída). */
async function configurar(teto = "1000") {
  await db().configuracao.create({ data: { id: "global", tetoMensalBrl: teto, cotacaoUsdBrl: "5", cotacaoAtualizadaEm: AGORA } });
  await db().precoModelo.create({
    data: { provedor: "anthropic", modelo: "modelo-texto", usdPorMTokEntrada: "10", usdPorMTokSaida: "50" },
  });
}

function reservar(valor: string, contaId: string | null = null, agora = AGORA, cliente = db()) {
  return reservarOrcamento({ contaId, valorBrl: valor, validadeMs: 8 * MIN, origem: "job:teste" }, cliente, agora);
}

/** 1.000 tokens de saída × US$ 50/M × 5 = R$ 0,25. */
const USO_25_CENTAVOS = [{ modelo: "modelo-texto", uso: { tokensSaida: 1000 } }];

describe("reservas de orçamento", () => {
  it("10 reservas simultâneas com saldo para 3 → exatamente 3", async () => {
    await configurar("30");
    const clientes = Array.from({ length: 5 }, () => criarDb({ poolMax: 2 }));
    try {
      const resultados = await Promise.all(
        Array.from({ length: 10 }, (_, i) => reservar("10", null, AGORA, clientes[i % clientes.length])),
      );
      expect(resultados.filter((r) => r.ok)).toHaveLength(3);
      expect(resultados.filter((r) => !r.ok).every((r) => r.decisao.motivo === "teto_geral")).toBe(true);
      expect(await db().reservaOrcamento.count()).toBe(3);
    } finally {
      await Promise.all(clientes.map((c) => c.$disconnect()));
    }
  });

  it("reservas e conciliações concorrentes nunca passam do teto", async () => {
    await configurar("10");
    const clientes = Array.from({ length: 4 }, () => criarDb({ poolMax: 2 }));
    try {
      const ciclos = Array.from({ length: 12 }, async (_, i) => {
        const cliente = clientes[i % clientes.length];
        const r = await reservar("3", null, AGORA, cliente);
        if (!r.ok) return;
        // custo real menor que o reservado (R$ 0,25)
        await registrarUsosEConciliar(
          { reservaId: r.reservaId, contaId: null, provedor: "anthropic", tipo: "TEXTO", usos: USO_25_CENTAVOS },
          cliente,
          AGORA,
        );
      });
      await Promise.all(ciclos);
      const c = await comprometidoNoMes(db(), "2026-10", null, AGORA);
      expect(c.geral.lte(10)).toBe(true);
      expect(c.reservadoGeral.toString()).toBe("0");
      expect(await db().reservaOrcamento.count({ where: { status: { not: "CONCILIADA" } } })).toBe(0);
    } finally {
      await Promise.all(clientes.map((c) => c.$disconnect()));
    }
  });

  it("reserva expirada não conta; liberar é idempotente", async () => {
    await configurar("10");
    const a = await reservar("8");
    expect(a.ok).toBe(true);
    expect((await reservar("5")).ok).toBe(false);
    // 9 minutos depois a reserva (validade 8 min) não conta mais
    expect((await reservar("5", null, new Date(AGORA.getTime() + 9 * MIN))).ok).toBe(true);
    expect(await expirarReservas(db(), new Date(AGORA.getTime() + 9 * MIN))).toBe(1);

    await db().reservaOrcamento.deleteMany();
    const b = await reservar("8");
    if (!b.ok) throw new Error("esperava reserva");
    expect(await liberarReserva(b.reservaId)).toBe(true);
    expect(await liberarReserva(b.reservaId)).toBe(false);
    expect((await reservar("10")).ok).toBe(true);
  });

  it("conciliar troca o reservado pelo custo real, sem dupla contagem", async () => {
    await configurar();
    const r = await reservar("10");
    if (!r.ok) throw new Error("esperava reserva");
    expect((await comprometidoNoMes(db(), "2026-10", null, AGORA)).geral.toString()).toBe("10");
    const { geracoes } = await registrarUsosEConciliar(
      {
        reservaId: r.reservaId,
        contaId: null,
        especialista: "produto",
        versaoPrompt: "v1",
        provedor: "anthropic",
        tipo: "TEXTO",
        usos: USO_25_CENTAVOS,
      },
      db(),
      AGORA,
    );
    expect(geracoes).toHaveLength(1);
    expect(geracoes[0]).toMatchObject({ reservaId: r.reservaId, especialista: "produto", precoPendente: false });
    expect((await db().reservaOrcamento.findUniqueOrThrow({ where: { id: r.reservaId } })).status).toBe("CONCILIADA");
    expect((await comprometidoNoMes(db(), "2026-10", null, AGORA)).geral.toString()).toBe("0.25");
  });

  it("cota da conta conta as reservas da conta", async () => {
    await configurar();
    const conta = await db().contaInstagram.create({ data: { nome: "A", tetoMensalBrl: "20" } });
    expect((await reservar("15", conta.id)).ok).toBe(true);
    const negada = await reservar("6", conta.id);
    expect(negada.ok).toBe(false);
    expect(negada.decisao.motivo).toBe("teto_conta");
    expect(negada.decisao.saldoContaBrl?.toString()).toBe("5");
    expect((await reservar("6", null)).ok).toBe(true);
  });

  it("podeGastar enxerga as reservas ativas", async () => {
    await configurar("10");
    await reservar("9");
    expect(await podeGastar(null, "2", db(), AGORA)).toMatchObject({ permitido: false, motivo: "teto_geral" });
    expect((await podeGastar(null, "1", db(), AGORA)).permitido).toBe(true);
  });

  it("conciliação tardia de reserva EXPIRADA ou LIBERADA grava o custo e soma certo", async () => {
    await configurar();
    const a = await reservar("10");
    const b = await reservar("10");
    if (!a.ok || !b.ok) throw new Error("esperava reservas");
    await expirarReservas(db(), new Date(AGORA.getTime() + 9 * MIN));
    await liberarReserva(b.reservaId);
    for (const id of [a.reservaId, b.reservaId]) {
      await registrarUsosEConciliar(
        { reservaId: id, contaId: null, provedor: "anthropic", tipo: "TEXTO", usos: USO_25_CENTAVOS },
        db(),
        AGORA,
      );
    }
    expect(await db().geracaoIA.count()).toBe(2);
    expect(await db().reservaOrcamento.count({ where: { status: "CONCILIADA" } })).toBe(2);
    expect((await comprometidoNoMes(db(), "2026-10", null, AGORA)).geral.toString()).toBe("0.5");
  });

  it("modelo sem preço: PENDENTE_PRECO segue contando; cadastrar o preço concilia", async () => {
    await configurar();
    const r = await reservar("10");
    if (!r.ok) throw new Error("esperava reserva");
    await registrarUsosEConciliar(
      {
        reservaId: r.reservaId,
        contaId: null,
        provedor: "anthropic",
        tipo: "TEXTO",
        usos: [...USO_25_CENTAVOS, { modelo: "modelo-fallback", uso: { tokensSaida: 2000 } }],
      },
      db(),
      AGORA,
    );
    expect((await db().reservaOrcamento.findUniqueOrThrow({ where: { id: r.reservaId } })).status).toBe("PENDENTE_PRECO");
    // reservado (10) + custo do modelo com preço (0,25)
    expect((await comprometidoNoMes(db(), "2026-10", null, AGORA)).geral.toString()).toBe("10.25");

    await db().precoModelo.create({
      data: { provedor: "anthropic", modelo: "modelo-fallback", usdPorMTokEntrada: "10", usdPorMTokSaida: "50" },
    });
    expect(await recalcularGeracoesSemPreco("anthropic", "modelo-fallback")).toEqual({ geracoes: 1, reservas: 1 });
    expect((await db().reservaOrcamento.findUniqueOrThrow({ where: { id: r.reservaId } })).status).toBe("CONCILIADA");
    expect((await comprometidoNoMes(db(), "2026-10", null, AGORA)).geral.toString()).toBe("0.75");
  });

  it("virada de mês: reserva em outubro conciliada em novembro conta em outubro", async () => {
    await configurar();
    const r = await reservar("10", null, new Date("2026-11-01T02:55:00Z")); // 31/10 23:55 em SP
    if (!r.ok) throw new Error("esperava reserva");
    expect(r.mesReferencia).toBe("2026-10");
    const { geracoes } = await registrarUsosEConciliar(
      { reservaId: r.reservaId, contaId: null, provedor: "anthropic", tipo: "TEXTO", usos: USO_25_CENTAVOS },
      db(),
      new Date("2026-11-01T03:05:00Z"), // 01/11 00:05 em SP
    );
    expect(geracoes[0].mesReferencia).toBe("2026-10");
  });
});
