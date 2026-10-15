import type { z } from "zod";
import type { Job } from "@/generated/prisma/client";

export type ContextoHandler<P> = {
  payload: P;
  job: Job;
  /** Abortado quando o job passa do timeoutMs. Handlers devem respeitá-lo. */
  signal: AbortSignal;
};

/**
 * Definição de um tipo de job. Regra: todo handler deve ser idempotente
 * (pode rodar mais de uma vez, por exemplo depois de uma recuperação).
 */
export type DefinicaoJob<P = unknown> = {
  schema: z.ZodType<P>;
  executar: (ctx: ContextoHandler<P>) => Promise<unknown>;
  maxTentativas?: number;
  timeoutMs?: number;
};

// O payload de cada tipo é validado pelo próprio schema antes de chegar ao handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Registro = Record<string, DefinicaoJob<any>>;

export function definirJob<P>(def: DefinicaoJob<P>): DefinicaoJob<P> {
  return def;
}
