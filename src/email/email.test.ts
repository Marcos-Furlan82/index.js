import { afterEach, describe, expect, it, vi } from "vitest";
import { ErroPermanente } from "@/jobs/erros";
import { limparCacheEnv } from "@/lib/env";
import { criarProvedorEmail } from "./index";
import { caixaDeSaida } from "./memoria";
import { montarEmail } from "./modelos";
import { escaparHtml } from "./modelos/html";
import { criarProvedorResend } from "./resend";
import { criarProvedorConsole } from "./console";

const MENSAGEM = { para: "gestor@exemplo.com", assunto: "Olá", html: "<p>segredo do corpo</p>", texto: "segredo do corpo" };

afterEach(() => {
  vi.unstubAllEnvs();
  limparCacheEnv();
});

describe("seleção do provedor", () => {
  it.each([
    ["console", "console"],
    ["memoria", "memoria"],
  ])("EMAIL_PROVEDOR=%s", (valor, nome) => {
    vi.stubEnv("EMAIL_PROVEDOR", valor);
    limparCacheEnv();
    expect(criarProvedorEmail().nome).toBe(nome);
  });

  it("resend exige chave e remetente", () => {
    vi.stubEnv("EMAIL_PROVEDOR", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    limparCacheEnv();
    expect(() => criarProvedorEmail()).toThrow(/RESEND_API_KEY/);
    vi.stubEnv("RESEND_API_KEY", "re_teste");
    vi.stubEnv("EMAIL_REMETENTE", "Planejador <avisos@exemplo.com>");
    limparCacheEnv();
    expect(criarProvedorEmail().nome).toBe("resend");
  });
});

describe("Resend", () => {
  it("envia com remetente, texto e chave de idempotência", async () => {
    const send = vi.fn().mockResolvedValue({ data: { id: "re_123" }, error: null });
    const provedor = criarProvedorResend({ apiKey: "x", remetente: "Avisos <a@b.com>" }, { emails: { send } } as never);
    expect(await provedor.enviar(MENSAGEM, { chaveIdempotencia: "job-1" })).toEqual({ id: "re_123" });
    expect(send).toHaveBeenCalledWith(
      { from: "Avisos <a@b.com>", to: MENSAGEM.para, subject: "Olá", html: MENSAGEM.html, text: MENSAGEM.texto },
      { idempotencyKey: "job-1" },
    );
  });

  it("erro de validação vira ErroPermanente; erro de servidor pode repetir", async () => {
    const recusa = vi.fn().mockResolvedValue({ data: null, error: { name: "validation_error", statusCode: 422, message: "inválido" } });
    const p1 = criarProvedorResend({ apiKey: "x", remetente: "a@b.com" }, { emails: { send: recusa } } as never);
    await expect(p1.enviar(MENSAGEM)).rejects.toBeInstanceOf(ErroPermanente);
    const fora = vi.fn().mockResolvedValue({ data: null, error: { name: "internal_server_error", statusCode: 500, message: "x" } });
    const p2 = criarProvedorResend({ apiKey: "x", remetente: "a@b.com" }, { emails: { send: fora } } as never);
    const erro = await p2.enviar(MENSAGEM).catch((e) => e);
    expect(erro).toBeInstanceOf(Error);
    expect(erro).not.toBeInstanceOf(ErroPermanente);
  });
});

describe("console e memória", () => {
  it("console registra destinatário e assunto, nunca o corpo", async () => {
    vi.stubEnv("LOG_SILENCIOSO", "0");
    const espiao = vi.spyOn(console, "log").mockImplementation(() => {});
    await criarProvedorConsole().enviar(MENSAGEM);
    const saida = espiao.mock.calls.flat().join(" ");
    expect(saida).toContain("gestor@exemplo.com");
    expect(saida).toContain("Olá");
    expect(saida).not.toContain("segredo do corpo");
    espiao.mockRestore();
  });

  it("memória guarda os e-mails", async () => {
    vi.stubEnv("EMAIL_PROVEDOR", "memoria");
    limparCacheEnv();
    const antes = caixaDeSaida.length;
    await criarProvedorEmail().enviar(MENSAGEM);
    expect(caixaDeSaida.length).toBe(antes + 1);
  });
});

describe("modelos", () => {
  it("escapa HTML dos dados", () => {
    expect(escaparHtml(`<script>"x" & 'y'</script>`)).toBe("&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;");
    const email = montarEmail("teste", { solicitadoPor: "<b>Ana</b>" });
    expect(email.html).toContain("&lt;b&gt;Ana&lt;/b&gt;");
    expect(email.texto).toContain("<b>Ana</b>");
  });

  it("alerta de orçamento em reais", () => {
    const email = montarEmail("alerta-orcamento", {
      mesReferencia: "2026-10",
      limiar: 80,
      percentual: "81.5",
      gastoBrl: "815",
      tetoBrl: "1000",
    });
    expect(email.assunto).toBe("Orçamento de IA: 80% usado (10/2026)");
    expect(email.texto).toContain("R$ 815,00");
    expect(email.texto).toContain("81,50%");
    expect(email.texto).toContain("R$ 1.000,00");
  });
});
