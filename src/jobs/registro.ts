import { TIMEOUT_MAXIMO_MS, TIMEOUT_PADRAO_MS } from "./limites";
import type { DefinicaoJob, Registro } from "./tipos";
import { enviarEmail } from "./handlers/enviar-email";
import { ping } from "./handlers/ping";

export function timeoutDe(def: Pick<DefinicaoJob, "timeoutMs">): number {
  return def.timeoutMs ?? TIMEOUT_PADRAO_MS;
}

/** Valida os limites de cada tipo. Chamado na carga do registro. */
export function validarRegistro<R extends Registro>(registro: R): R {
  for (const [tipo, def] of Object.entries(registro)) {
    const timeout = timeoutDe(def);
    if (!(timeout > 0 && timeout <= TIMEOUT_MAXIMO_MS)) {
      throw new Error(`Job "${tipo}": timeoutMs deve estar entre 1 e ${TIMEOUT_MAXIMO_MS} ms.`);
    }
    if (def.maxTentativas !== undefined && !(def.maxTentativas >= 1)) {
      throw new Error(`Job "${tipo}": maxTentativas deve ser >= 1.`);
    }
  }
  return registro;
}

export function maiorTimeout(registro: Registro): number {
  return Math.max(TIMEOUT_PADRAO_MS, ...Object.values(registro).map(timeoutDe));
}

export const REGISTRO: Registro = validarRegistro({
  ping,
  "enviar-email": enviarEmail,
});

export type TipoJob = "ping" | "enviar-email";
