import type { StatusFicha } from "@/generated/prisma/client";

export const ETAPAS_BRIEFING = [
  { numero: 1, nome: "Negócio" },
  { numero: 2, nome: "Público e provas" },
  { numero: 3, nome: "Momento e meta" },
  { numero: 4, nome: "Isca e rotina" },
  { numero: 5, nome: "Referências visuais" },
] as const;

export const TOTAL_ETAPAS = ETAPAS_BRIEFING.length;

export function rotuloFicha(ficha: { status: StatusFicha; versao: number } | null | undefined): string {
  if (!ficha) return "ainda não gerada";
  if (ficha.status === "APROVADA") return `aprovada (versão ${ficha.versao})`;
  if (ficha.status === "RASCUNHO") return `em revisão (versão ${ficha.versao})`;
  return `versão ${ficha.versao}`;
}
