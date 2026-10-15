import { Decimal } from "@prisma/client/runtime/client";

/**
 * Dinheiro sem float: tudo em Decimal. Custos guardam muitas casas;
 * o arredondamento (meio para cima, 2 casas) só acontece na exibição
 * e na comparação com o teto.
 */

export { Decimal };
export type ValorDecimal = Decimal | string | number;

export const CASAS = { brl: 2, cotacao: 4, preco: 6 } as const;

export function dec(valor: ValorDecimal | null | undefined): Decimal {
  if (valor === null || valor === undefined) return new Decimal(0);
  return valor instanceof Decimal ? valor : new Decimal(valor);
}

export function arredondar2(valor: ValorDecimal): Decimal {
  return dec(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export type ResultadoParse = { ok: true; valor: Decimal } | { ok: false; erro: string };

// Formato brasileiro estrito: milhar com ponto (grupos de 3) e decimal com vírgula.
// Aceitos: "1000", "1.000", "1.000,50", "1,5". Rejeitados: "1.5", "1,000.50", "1.00", "1..000".
const FORMATO_BR = /^(\d{1,3}(\.\d{3})+|\d+)(,(\d+))?$/;

export function parseValorBR(texto: string, casasMaximas: number): ResultadoParse {
  const limpo = (texto ?? "").trim();
  if (!limpo) return { ok: false, erro: "Informe um valor." };
  if (limpo.startsWith("-")) return { ok: false, erro: "O valor não pode ser negativo." };
  const m = FORMATO_BR.exec(limpo);
  if (!m) {
    return { ok: false, erro: "Use o formato brasileiro, por exemplo 1.000,50." };
  }
  const decimais = m[4] ?? "";
  if (decimais.length > casasMaximas) {
    return { ok: false, erro: `Use no máximo ${casasMaximas} casas decimais.` };
  }
  const inteiro = m[1].replace(/\./g, "");
  return { ok: true, valor: new Decimal(decimais ? `${inteiro}.${decimais}` : inteiro) };
}

function agruparMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** "1234.5" → "1.234,50" (casas fixas, meio para cima). */
export function formatarDecimalBR(valor: ValorDecimal, casas = 2): string {
  const fixo = dec(valor).toDecimalPlaces(casas, Decimal.ROUND_HALF_UP).toFixed(casas);
  const negativo = fixo.startsWith("-");
  const [inteiro, fracao] = (negativo ? fixo.slice(1) : fixo).split(".");
  const texto = agruparMilhar(inteiro) + (fracao ? `,${fracao}` : "");
  return negativo ? `-${texto}` : texto;
}

export function formatarBRL(valor: ValorDecimal): string {
  return `R$ ${formatarDecimalBR(valor, 2)}`;
}

export function formatarUSD(valor: ValorDecimal, casas = 2): string {
  return `US$ ${formatarDecimalBR(valor, casas)}`;
}

/** Percentual de parte sobre total, com 2 casas (0 se total = 0). */
export function percentual(parte: ValorDecimal, total: ValorDecimal): Decimal {
  const t = dec(total);
  if (t.isZero()) return new Decimal(0);
  return dec(parte).div(t).mul(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}
