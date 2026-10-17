import { z } from "zod";
import { limparMidiasPendentes, limparMidiasRejeitadas } from "@/armazenamento/limpeza";
import { expirarReservas } from "@/custos/reservas";
import { definirJob } from "../tipos";

/**
 * Uma vez por dia (chave manutencao:AAAA-MM-DD): limpa uploads abandonados,
 * mídias rejeitadas antigas e expira reservas de orçamento órfãs. Idempotente.
 */
export const manutencaoDiaria = definirJob({
  schema: z.object({ dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  maxTentativas: 3,
  timeoutMs: 2 * 60_000,
  async executar() {
    const reservasExpiradas = await expirarReservas();
    const pendentesRemovidas = await limparMidiasPendentes();
    const rejeitadasRemovidas = await limparMidiasRejeitadas();
    return { reservasExpiradas, pendentesRemovidas, rejeitadasRemovidas };
  },
});
