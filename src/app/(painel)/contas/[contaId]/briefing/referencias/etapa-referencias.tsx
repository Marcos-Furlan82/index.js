import { ListaFaltantes } from "@/componentes/lista-faltantes";
import type { Faltante } from "@/briefing/obrigatorios";

/** Etapa 5 (referências visuais). */
export async function EtapaReferencias({ faltando }: { contaId: string; produtoId: string; somenteLeitura: boolean; faltando: Faltante[] }) {
  return <ListaFaltantes faltando={faltando} />;
}
