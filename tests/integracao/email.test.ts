import { beforeEach, describe, expect, it } from "vitest";
import { destinoDoRedirect, requisicaoFalsa } from "./next-falso";
import { enviarEmailTeste } from "@/app/(painel)/configuracoes/sistema/actions";
import { limparProvedorEmail } from "@/email";
import { caixaDeSaida } from "@/email/memoria";
import { executarLote } from "@/jobs/executor";
import { enfileirarJob } from "@/jobs/fila";
import { obterDb } from "@/lib/db";
import { entrarComoGestor } from "./ajudantes";

beforeEach(() => {
  requisicaoFalsa.limpar();
  caixaDeSaida.length = 0;
  limparProvedorEmail();
});

describe("e-mail pela fila", () => {
  it("job enviar-email monta o modelo e envia com chave de idempotência do job", async () => {
    const job = await enfileirarJob({
      tipo: "enviar-email",
      payload: { para: "gestor@exemplo.com", modelo: "teste", dados: { solicitadoPor: "Ana" } },
    });
    await executarLote();
    expect(caixaDeSaida).toHaveLength(1);
    expect(caixaDeSaida[0]).toMatchObject({
      para: "gestor@exemplo.com",
      assunto: "E-mail de teste do Planejador de Instagram",
      chaveIdempotencia: `job-${job.id}`,
    });
    const final = await obterDb().job.findUniqueOrThrow({ where: { id: job.id } });
    expect(final.status).toBe("CONCLUIDO");
    expect(final.resultado).toMatchObject({ emailId: caixaDeSaida[0].id });
  });

  it("rejeita modelo inexistente ou dados inválidos ao enfileirar", async () => {
    await expect(
      enfileirarJob({ tipo: "enviar-email", payload: { para: "a@b.com", modelo: "nao-existe", dados: {} } }),
    ).rejects.toThrow(/Payload inválido/);
    await expect(
      enfileirarJob({ tipo: "enviar-email", payload: { para: "a@b.com", modelo: "alerta-orcamento", dados: {} } }),
    ).rejects.toThrow(/Payload inválido/);
    await expect(
      enfileirarJob({ tipo: "enviar-email", payload: { para: "nao-e-email", modelo: "teste" } }),
    ).rejects.toThrow(/Payload inválido/);
  });

  it("ação de e-mail de teste exige sessão e enfileira para o próprio gestor", async () => {
    expect(await destinoDoRedirect(() => enviarEmailTeste())).toBe("/login");
    expect(await obterDb().job.count()).toBe(0);
    await entrarComoGestor();
    expect((await enviarEmailTeste()).ok).toContain("gestor@exemplo.com");
    expect(await obterDb().job.findFirst()).toMatchObject({ tipo: "enviar-email", status: "PENDENTE" });
  });
});
