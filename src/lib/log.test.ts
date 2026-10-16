import { describe, expect, it } from "vitest";
import { chaveSensivel, REDIGIDO, redigir } from "./log";

describe("redação de logs", () => {
  it.each([
    "token",
    "accessToken",
    "access_token",
    "senha",
    "senhaHash",
    "password",
    "apiKey",
    "api-key",
    "RESEND_API_KEY",
    "Authorization",
    "cookie",
    "set-cookie",
    "X-Amz-Signature",
    "x-segredo-jobs",
    "JOBS_SECRET",
  ])("redige %s", (chave) => {
    expect(chaveSensivel(chave)).toBe(true);
  });

  it.each(["tokensEntrada", "tokensSaida", "email", "id", "tipo", "tentativas"])(
    "mantém %s",
    (chave) => {
      expect(chaveSensivel(chave)).toBe(false);
    },
  );

  it("redige recursivamente e limpa URLs pré-assinadas", () => {
    const saida = redigir({
      job: { id: "1", dados: { accessToken: "abc", tokensEntrada: 10 } },
      headers: [{ authorization: "Bearer x" }],
      url: "https://conta.r2.cloudflarestorage.com/bucket/a.jpg?X-Amz-Algorithm=AWS4&X-Amz-Signature=abc",
      erro: new Error("falhou em https://x.com/a?X-Amz-Credential=seg"),
    }) as Record<string, unknown>;
    expect(saida).toEqual({
      job: { id: "1", dados: { accessToken: REDIGIDO, tokensEntrada: 10 } },
      headers: [{ authorization: REDIGIDO }],
      url: `https://conta.r2.cloudflarestorage.com/bucket/a.jpg?${REDIGIDO}`,
      erro: { nome: "Error", mensagem: `falhou em https://x.com/a?${REDIGIDO}` },
    });
  });

  it("redige dados do briefing e da IA (respostas, conteúdo, instrução, payload)", () => {
    expect(
      redigir({ jobId: "1", briefing: { dor: "x" }, respostas: {}, conteudo: "y", instrucao: "z", payload: { produtoId: "p" }, codigo: "ia:recusa" }),
    ).toEqual({ jobId: "1", briefing: REDIGIDO, respostas: REDIGIDO, conteudo: REDIGIDO, instrucao: REDIGIDO, payload: REDIGIDO, codigo: "ia:recusa" });
  });
});
