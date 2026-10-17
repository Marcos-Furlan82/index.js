import { TZDate } from "@date-fns/tz";
import { format, getDaysInMonth } from "date-fns";

export const FUSO_PADRAO = "America/Sao_Paulo";

/** Mês de referência "AAAA-MM" no fuso informado (padrão: São Paulo). */
export function mesReferencia(agora: Date = new Date(), fuso = FUSO_PADRAO): string {
  return format(new TZDate(agora, fuso), "yyyy-MM");
}

function partesDoMes(mes: string): { ano: number; indice: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) throw new Error(`Mês inválido: ${mes}`);
  return { ano: Number(m[1]), indice: Number(m[2]) - 1 };
}

/** Início (inclusivo) e fim (exclusivo) do mês no fuso, como instantes UTC. */
export function limitesDoMes(mes: string, fuso = FUSO_PADRAO): { inicio: Date; fim: Date } {
  const { ano, indice } = partesDoMes(mes);
  const inicio = new TZDate(ano, indice, 1, 0, 0, 0, fuso);
  const fim = new TZDate(ano, indice + 1, 1, 0, 0, 0, fuso);
  return { inicio: new Date(inicio.getTime()), fim: new Date(fim.getTime()) };
}

/** Dia do mês (1..31) no fuso. */
export function diaDoMes(agora: Date = new Date(), fuso = FUSO_PADRAO): number {
  return new TZDate(agora, fuso).getDate();
}

export function diasNoMes(mes: string): number {
  const { ano, indice } = partesDoMes(mes);
  return getDaysInMonth(new Date(ano, indice, 1));
}

export function formatarDataHora(data: Date, fuso = FUSO_PADRAO): string {
  return format(new TZDate(data, fuso), "dd/MM/yyyy HH:mm");
}
