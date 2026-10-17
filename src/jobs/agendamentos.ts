import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import { FUSO_PADRAO } from "@/lib/datas";
import { obterDb, type ClienteDb } from "@/lib/db";
import { enfileirarJob } from "./fila";

export function diaEmSaoPaulo(agora: Date = new Date()): string {
  return format(new TZDate(agora, FUSO_PADRAO), "yyyy-MM-dd");
}

/**
 * Garante os jobs diários. Chamado a cada despacho: a chave de idempotência
 * (manutencao:AAAA-MM-DD no fuso de SP) faz o job existir uma única vez por dia.
 */
export async function garantirJobsDiarios(db: ClienteDb = obterDb(), agora = new Date()) {
  const dia = diaEmSaoPaulo(agora);
  return enfileirarJob({ tipo: "manutencao-diaria", payload: { dia }, chaveIdempotencia: `manutencao:${dia}` }, db);
}
