import { describe, expect, it } from "vitest";
import { detectarTipoReal, tiposCompativeis } from "./tipo-real";

const b = (...bytes: number[]) => Buffer.from(bytes);
const t = (texto: string) => Buffer.from(texto, "latin1");

describe("tipo real pelos bytes", () => {
  it("reconhece os formatos aceitos", () => {
    expect(detectarTipoReal(b(0xff, 0xd8, 0xff, 0xe0, 0))).toBe("image/jpeg");
    expect(detectarTipoReal(b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("image/png");
    expect(detectarTipoReal(t("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(detectarTipoReal(t("%PDF-1.7\n"))).toBe("application/pdf");
    expect(detectarTipoReal(t("%!PS-Adobe-3.0 EPSF"))).toBe("application/postscript");
    expect(detectarTipoReal(b(0xc5, 0xd0, 0xd3, 0xc6, 0))).toBe("application/postscript");
    expect(detectarTipoReal(t("wOF2\x00\x01"))).toBe("font/woff2");
    expect(detectarTipoReal(t("OTTO\0"))).toBe("font/otf");
    expect(detectarTipoReal(b(0, 1, 0, 0, 0, 0x10))).toBe("font/ttf");
    expect(detectarTipoReal(Buffer.from('\uFEFF  <?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>', "utf8"))).toBe("image/svg+xml");
    expect(detectarTipoReal(t("<svg>"))).toBe("image/svg+xml");
  });

  it("não reconhece HTML, texto ou executável", () => {
    expect(detectarTipoReal(t("<html><body>oi</body></html>"))).toBeNull();
    expect(detectarTipoReal(t("MZ\x90\0"))).toBeNull();
    expect(detectarTipoReal(t("texto qualquer"))).toBeNull();
    expect(detectarTipoReal(Buffer.alloc(0))).toBeNull();
  });

  it("compatibilidade entre declarado e real", () => {
    expect(tiposCompativeis("image/png", "image/png")).toBe(true);
    expect(tiposCompativeis("image/png", "image/jpeg")).toBe(false);
    expect(tiposCompativeis("application/postscript", "application/pdf")).toBe(true);
    expect(tiposCompativeis("font/otf", "font/ttf")).toBe(true);
    expect(tiposCompativeis("image/svg+xml", "application/pdf")).toBe(false);
  });
});
