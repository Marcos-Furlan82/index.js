import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { limparCacheEnv } from "@/lib/env";
import { gerarUrlUpload, limparClienteR2, urlPublica } from "./r2";

beforeEach(() => {
  process.env.R2_ACCOUNT_ID = "conta123";
  process.env.R2_ACCESS_KEY_ID = "AKIDTESTE";
  process.env.R2_SECRET_ACCESS_KEY = "segredo-teste";
  process.env.R2_BUCKET = "midias";
  process.env.R2_PUBLIC_BASE_URL = "https://midia.exemplo.com/";
  limparCacheEnv();
  limparClienteR2();
});

afterEach(() => {
  limparCacheEnv();
  limparClienteR2();
});

describe("R2", () => {
  it("gera URL PUT pré-assinada no endpoint da conta, 15 min, com tipo e tamanho assinados", async () => {
    const url = new URL(
      await gerarUrlUpload({ chave: "contas/geral/2026/10/abc.jpg", tipoMime: "image/jpeg", tamanhoBytes: 1234 }),
    );
    expect(url.host).toBe("conta123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/midias/contas/geral/2026/10/abc.jpg");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host");
    expect(url.searchParams.get("X-Amz-Credential")).toContain("/auto/s3/aws4_request");
    // Sem checksum automático (o navegador não enviaria).
    expect([...url.searchParams.keys()].some((k) => k.toLowerCase().includes("checksum"))).toBe(false);
  });

  it("monta a URL pública sem barra dupla", () => {
    expect(urlPublica("contas/geral/2026/10/a b.jpg")).toBe("https://midia.exemplo.com/contas/geral/2026/10/a%20b.jpg");
  });
});
