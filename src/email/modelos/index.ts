import { dadosAlertaOrcamento, modeloAlertaOrcamento } from "./alerta-orcamento";
import { dadosTeste, modeloTeste } from "./teste";

/** Modelos de e-mail: schema dos dados + função que monta assunto, HTML e texto. */
export const MODELOS = {
  teste: { dados: dadosTeste, montar: modeloTeste },
  "alerta-orcamento": { dados: dadosAlertaOrcamento, montar: modeloAlertaOrcamento },
} as const;

export type NomeModelo = keyof typeof MODELOS;

export function montarEmail(modelo: NomeModelo, dados: unknown) {
  const def = MODELOS[modelo];
  // O schema de cada modelo garante o formato aceito por montar().
  return def.montar(def.dados.parse(dados) as never);
}
