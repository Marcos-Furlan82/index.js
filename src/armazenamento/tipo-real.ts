/**
 * Tipo real do arquivo pelos primeiros bytes (magic numbers), sem confiar
 * no tipo informado pelo navegador nem na extensão.
 */
export const TIPOS_REAIS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/postscript",
  "font/ttf",
  "font/otf",
  "font/woff2",
] as const;
export type TipoReal = (typeof TIPOS_REAIS)[number];

function comeca(buf: Buffer, bytes: number[], deslocamento = 0) {
  if (buf.length < deslocamento + bytes.length) return false;
  return bytes.every((b, i) => buf[deslocamento + i] === b);
}

function ascii(buf: Buffer, texto: string, deslocamento = 0) {
  return comeca(buf, [...texto].map((c) => c.charCodeAt(0)), deslocamento);
}

function pareceSvg(buf: Buffer): boolean {
  const inicio = buf.subarray(0, 4096);
  if (inicio.includes(0)) return false;
  const texto = inicio.toString("utf8").replace(/^﻿/, "").trimStart();
  if (!texto.startsWith("<")) return false;
  return /<svg[\s>]/i.test(texto);
}

export function detectarTipoReal(buf: Buffer): TipoReal | null {
  if (comeca(buf, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (comeca(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(buf, "RIFF") && ascii(buf, "WEBP", 8)) return "image/webp";
  if (ascii(buf, "%PDF-")) return "application/pdf";
  if (ascii(buf, "%!PS") || comeca(buf, [0xc5, 0xd0, 0xd3, 0xc6])) return "application/postscript";
  if (ascii(buf, "wOF2")) return "font/woff2";
  if (ascii(buf, "OTTO")) return "font/otf";
  if (comeca(buf, [0x00, 0x01, 0x00, 0x00]) || ascii(buf, "true")) return "font/ttf";
  if (pareceSvg(buf)) return "image/svg+xml";
  return null;
}

/** Tipos que podem aparecer um no lugar do outro (ex.: .ai é PDF por dentro; .otf com contornos TrueType). */
const GRUPOS: TipoReal[][] = [
  ["application/pdf", "application/postscript"],
  ["font/ttf", "font/otf"],
];

export function tiposCompativeis(declarado: string, real: TipoReal): boolean {
  if (declarado === real) return true;
  return GRUPOS.some((g) => g.includes(real) && (g as string[]).includes(declarado));
}
