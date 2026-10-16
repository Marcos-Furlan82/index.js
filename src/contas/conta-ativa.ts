import { cookies } from "next/headers";
import { emProducao } from "@/lib/env";
import { obterDb } from "@/lib/db";

/**
 * Conta ativa: só um PADRÃO de navegação (seletor no topo). As rotas e as
 * actions sempre recebem o contaId explícito; o cookie nunca autoriza nada.
 */
export const COOKIE_CONTA_ATIVA = "conta-ativa";

export async function lerContaAtiva(): Promise<string | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE_CONTA_ATIVA)?.value;
  if (!id) return null;
  const conta = await obterDb().contaInstagram.findUnique({ where: { id }, select: { id: true, arquivadaEm: true } });
  return conta && !conta.arquivadaEm ? conta.id : null;
}

export async function gravarContaAtiva(contaId: string) {
  const jar = await cookies();
  jar.set(COOKIE_CONTA_ATIVA, contaId, {
    httpOnly: true,
    secure: emProducao(),
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}
