import sharp from "sharp";

/**
 * Leitura de imagens com o sharp (só no servidor do painel; nunca no pacote
 * das funções de jobs). Limite de 50 megapixels contra "bombas" de pixels.
 */
export const LIMITE_PIXELS = 50_000_000;
export const LARGURA_MINIATURA = 400;
export const MENSAGEM_PIXELS = "Imagem grande demais (máximo de 50 megapixels).";

export class ErroImagem extends Error {}

function abrir(buf: Buffer) {
  return sharp(buf, { limitInputPixels: LIMITE_PIXELS, failOn: "error" });
}

function traduzir(erro: unknown): never {
  const msg = erro instanceof Error ? erro.message : "";
  if (/pixel limit/i.test(msg)) throw new ErroImagem(MENSAGEM_PIXELS);
  throw new ErroImagem("Não conseguimos abrir esta imagem. Confira se o arquivo não está corrompido.");
}

export async function inspecionarImagem(buf: Buffer): Promise<{ largura: number; altura: number; temAlfa: boolean; formato: string }> {
  try {
    const m = await abrir(buf).metadata();
    if (!m.width || !m.height) throw new Error("sem dimensões");
    if (m.width * m.height > LIMITE_PIXELS) throw new Error("pixel limit");
    return { largura: m.width, altura: m.height, temAlfa: !!m.hasAlpha, formato: m.format ?? "" };
  } catch (erro) {
    traduzir(erro);
  }
}

/** Miniatura WebP de 400 px de largura (sem aumentar imagens menores). */
export async function gerarMiniatura(buf: Buffer): Promise<Buffer> {
  try {
    return await abrir(buf)
      .rotate()
      .resize({ width: LARGURA_MINIATURA, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch (erro) {
    traduzir(erro);
  }
}
