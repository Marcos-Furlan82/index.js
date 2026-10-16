import { beforeEach, describe, expect, it } from "vitest";
import { destinoDoRedirect, requisicaoFalsa } from "./next-falso";
import {
  removerPreco,
  salvarAcaoAoAtingirTeto,
  salvarCotacao,
  salvarEmailNotificacao,
  salvarPreco,
  salvarTeto,
  salvarTetoConta,
} from "@/app/(painel)/configuracoes/orcamento/actions";
import { obterConfiguracao } from "@/custos/configuracao";
import { obterDb } from "@/lib/db";
import { entrarComoGestor } from "./ajudantes";

function form(dados: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(dados)) f.set(k, v);
  return f;
}

beforeEach(() => requisicaoFalsa.limpar());

describe("ações de Configurações → Orçamento", () => {
  it("todas exigem sessão", async () => {
    const acoes = [
      () => salvarTeto({}, form({ teto: "2.000" })),
      () => salvarCotacao({}, form({ cotacao: "5,5" })),
      () => salvarAcaoAoAtingirTeto({}, form({ acao: "PRIORIZAR_BARATOS" })),
      () => salvarEmailNotificacao({}, form({ email: "a@b.com" })),
      () => salvarPreco({}, form({ provedor: "p", modelo: "m", usdPorImagem: "1" })),
      () => removerPreco({}, form({ id: "6f1c2a8e-1111-4222-8333-444455556666" })),
      () => salvarTetoConta({}, form({ contaId: "6f1c2a8e-1111-4222-8333-444455556666", teto: "10" })),
    ];
    for (const acao of acoes) expect(await destinoDoRedirect(acao)).toBe("/login");
    expect(await obterDb().precoModelo.count()).toBe(0);
    expect(await obterDb().configuracao.count()).toBe(0);
  });

  it("teto aceita formato brasileiro e rejeita o resto", async () => {
    await entrarComoGestor();
    expect(await salvarTeto({}, form({ teto: "1.500,50" }))).toEqual({ ok: "Teto mensal salvo." });
    expect((await obterConfiguracao()).tetoMensalBrl.toString()).toBe("1500.5");
    for (const teto of ["1.5", "1,000.50", "", "-10", "0", "1,234"]) {
      expect((await salvarTeto({}, form({ teto }))).erro).toBeTruthy();
    }
    expect((await obterConfiguracao()).tetoMensalBrl.toString()).toBe("1500.5");
  });

  it("cotação guarda quem e quando", async () => {
    await entrarComoGestor();
    expect((await salvarCotacao({}, form({ cotacao: "5,43219" }))).erro).toBeTruthy();
    expect((await salvarCotacao({}, form({ cotacao: "5,4321" }))).ok).toBeTruthy();
    const c = await obterConfiguracao();
    expect(c.cotacaoUsdBrl?.toString()).toBe("5.4321");
    expect(c.cotacaoAtualizadaPor).toBe("gestor@exemplo.com");
    expect(c.cotacaoAtualizadaEm).not.toBeNull();
  });

  it("ação ao atingir o teto e e-mail de notificação", async () => {
    await entrarComoGestor();
    expect((await salvarAcaoAoAtingirTeto({}, form({ acao: "OUTRA" }))).erro).toBeTruthy();
    await salvarAcaoAoAtingirTeto({}, form({ acao: "PRIORIZAR_BARATOS" }));
    expect((await salvarEmailNotificacao({}, form({ email: "invalido" }))).erro).toBeTruthy();
    await salvarEmailNotificacao({}, form({ email: "Avisos@Exemplo.com" }));
    let c = await obterConfiguracao();
    expect(c).toMatchObject({ acaoAoAtingirTeto: "PRIORIZAR_BARATOS", emailNotificacao: "avisos@exemplo.com" });
    await salvarEmailNotificacao({}, form({ email: "" }));
    c = await obterConfiguracao();
    expect(c.emailNotificacao).toBeNull();
  });

  it("tabela de preços: cria, atualiza, valida e remove", async () => {
    await entrarComoGestor();
    expect((await salvarPreco({}, form({ provedor: "", modelo: "m" }))).erro).toBe("Informe o provedor.");
    expect((await salvarPreco({}, form({ provedor: "p", modelo: "m" }))).erro).toBe("Informe ao menos um preço.");
    expect((await salvarPreco({}, form({ provedor: "p", modelo: "m", usdPorImagem: "0.04" }))).erro).toBeTruthy();
    await salvarPreco({}, form({ provedor: "Anthropic", modelo: "modelo-x", usdPorMTokEntrada: "15", usdPorMTokSaida: "75" }));
    await salvarPreco({}, form({ provedor: "anthropic", modelo: "modelo-x", usdPorMTokEntrada: "12,5" }));
    const precos = await obterDb().precoModelo.findMany();
    expect(precos).toHaveLength(1);
    expect(precos[0].usdPorMTokEntrada?.toString()).toBe("12.5");
    expect(precos[0].usdPorMTokSaida).toBeNull();
    expect((await removerPreco({}, form({ id: precos[0].id }))).ok).toBeTruthy();
    expect(await obterDb().precoModelo.count()).toBe(0);
  });

  it("cota por conta: salva, valida, remove e recusa conta arquivada", async () => {
    await entrarComoGestor();
    const conta = await obterDb().contaInstagram.create({ data: { nome: "Doce Ateliê" } });
    expect(await salvarTetoConta({}, form({ contaId: conta.id, teto: "250,50" }))).toEqual({ ok: "Cota de Doce Ateliê salva." });
    expect((await obterDb().contaInstagram.findUniqueOrThrow({ where: { id: conta.id } })).tetoMensalBrl?.toString()).toBe("250.5");
    expect((await salvarTetoConta({}, form({ contaId: conta.id, teto: "0" }))).erro).toBeTruthy();
    expect((await salvarTetoConta({}, form({ contaId: conta.id, teto: "" }))).ok).toContain("só o teto geral");
    expect((await obterDb().contaInstagram.findUniqueOrThrow({ where: { id: conta.id } })).tetoMensalBrl).toBeNull();
    await obterDb().contaInstagram.update({ where: { id: conta.id }, data: { arquivadaEm: new Date() } });
    expect((await salvarTetoConta({}, form({ contaId: conta.id, teto: "10" }))).erro).toBe("Conta não encontrada.");
  });

  it("salvar o preço recalcula as gerações que estavam sem preço", async () => {
    await entrarComoGestor();
    await obterDb().configuracao.create({ data: { id: "global", cotacaoUsdBrl: "5" } });
    await obterDb().geracaoIA.create({
      data: { provedor: "anthropic", modelo: "m1", tipo: "TEXTO", tokensSaida: 1000, precoPendente: true, mesReferencia: "2026-10" },
    });
    const r = await salvarPreco({}, form({ provedor: "anthropic", modelo: "m1", usdPorMTokSaida: "50" }));
    expect(r.ok).toContain("1 geração sem preço foi recalculada");
    const g = await obterDb().geracaoIA.findFirstOrThrow();
    expect(g.precoPendente).toBe(false);
    expect(g.custoBrl?.toString()).toBe("0.25");
  });
});
