import { describe, expect, it } from "vitest";
import { esquemaSolicitacao, gerarChave, TIPOS_ACEITOS } from "./midias";

const MB = 1024 * 1024;
const base = { nomeOriginal: "foto.jpg" };

describe("validação da solicitação de upload", () => {
  it("aceita imagens até 20 MB e vídeos até 300 MB", () => {
    expect(esquemaSolicitacao.safeParse({ ...base, tipoMime: "image/png", tamanhoBytes: 20 * MB }).success).toBe(true);
    expect(esquemaSolicitacao.safeParse({ ...base, tipoMime: "video/mp4", tamanhoBytes: 300 * MB }).success).toBe(true);
    expect(esquemaSolicitacao.safeParse({ ...base, tipoMime: "video/quicktime", tamanhoBytes: 1 }).success).toBe(true);
  });

  it("rejeita vídeo com 300 MB + 1 byte e imagem acima de 20 MB", () => {
    const video = esquemaSolicitacao.safeParse({ ...base, tipoMime: "video/mp4", tamanhoBytes: 300 * MB + 1 });
    expect(video.success).toBe(false);
    expect(video.error?.issues[0].message).toContain("300 MB");
    expect(esquemaSolicitacao.safeParse({ ...base, tipoMime: "image/jpeg", tamanhoBytes: 20 * MB + 1 }).success).toBe(false);
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", "text/html", ""])("rejeita o tipo %j", (tipoMime) => {
    const r = esquemaSolicitacao.safeParse({ ...base, tipoMime, tamanhoBytes: 10 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("Tipo de arquivo não permitido.");
  });

  it("rejeita arquivo vazio e conta inválida", () => {
    expect(esquemaSolicitacao.safeParse({ ...base, tipoMime: "image/png", tamanhoBytes: 0 }).success).toBe(false);
    expect(esquemaSolicitacao.safeParse({ ...base, tipoMime: "image/png", tamanhoBytes: 1, contaId: "x" }).success).toBe(false);
  });
});

describe("chave do objeto", () => {
  it("usa conta (ou geral), ano/mês de São Paulo e extensão do mapa fixo", () => {
    const agora = new Date("2026-11-01T02:30:00Z"); // 31/10 em SP
    expect(gerarChave(null, "image/jpeg", agora)).toMatch(/^contas\/geral\/2026\/10\/[0-9a-f-]{36}\.jpg$/);
    const conta = "6f1c2a8e-1111-4222-8333-444455556666";
    expect(gerarChave(conta, "video/quicktime", agora)).toMatch(new RegExp(`^contas/${conta}/2026/10/[0-9a-f-]{36}\\.mov$`));
    expect(Object.values(TIPOS_ACEITOS).map((t) => t.extensao)).toEqual(["jpg", "png", "webp", "mp4", "mov"]);
  });
});
