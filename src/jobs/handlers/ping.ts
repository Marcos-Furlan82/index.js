import { z } from "zod";
import { definirJob } from "../tipos";

/** Job de teste: prova que o agendador e o executor funcionam. */
export const ping = definirJob({
  schema: z.object({ origem: z.string().max(50).optional() }),
  maxTentativas: 3,
  timeoutMs: 30_000,
  async executar() {
    return { pong: true, em: new Date().toISOString() };
  },
});
