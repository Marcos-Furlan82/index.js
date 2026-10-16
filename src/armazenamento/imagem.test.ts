import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { gerarMiniatura, inspecionarImagem, MENSAGEM_PIXELS } from "./imagem";

function png(largura: number, altura: number, alfa = true) {
  return sharp({
    create: { width: largura, height: altura, channels: alfa ? 4 : 3, background: alfa ? { r: 200, g: 0, b: 80, alpha: 0.5 } : "#c2185b" },
  })
    .png()
    .toBuffer();
}

describe("imagens", () => {
  it("inspeciona dimensões e transparência", async () => {
    expect(await inspecionarImagem(await png(1200, 1500))).toMatchObject({ largura: 1200, altura: 1500, temAlfa: true });
    expect((await inspecionarImagem(await png(100, 100, false))).temAlfa).toBe(false);
  });

  it("miniatura em WebP com 400 px de largura", async () => {
    const mini = await gerarMiniatura(await png(1200, 600));
    const m = await sharp(mini).metadata();
    expect(m).toMatchObject({ format: "webp", width: 400, height: 200 });
  });

  it("recusa mais de 50 megapixels e arquivo corrompido", async () => {
    const enorme = await sharp({ create: { width: 8000, height: 8000, channels: 3, background: "#fff" } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    await expect(inspecionarImagem(enorme)).rejects.toThrow(MENSAGEM_PIXELS);
    await expect(gerarMiniatura(enorme)).rejects.toThrow(MENSAGEM_PIXELS);
    await expect(inspecionarImagem(Buffer.from("não é imagem"))).rejects.toThrow(/Não conseguimos abrir/);
  });
});
