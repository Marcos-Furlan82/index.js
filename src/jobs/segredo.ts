import { createHash, timingSafeEqual } from "node:crypto";

export const HEADER_SEGREDO_JOBS = "x-segredo-jobs";

/** Comparação em tempo constante (sha256 dos dois lados: tamanhos iguais). */
export function segredoConfere(recebido: string | null | undefined, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}
