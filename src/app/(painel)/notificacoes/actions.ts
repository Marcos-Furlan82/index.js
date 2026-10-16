"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/auth/sessao";
import type { EstadoFormulario } from "@/componentes/formulario-acao";
import { marcarLidas } from "@/notificacoes/notificacoes";

export async function marcarTodasComoLidas(): Promise<EstadoFormulario> {
  await exigirSessao();
  const n = await marcarLidas("todas");
  revalidatePath("/", "layout");
  return { ok: n > 0 ? "Avisos marcados como lidos." : "Nenhum aviso novo." };
}
