"use server";

import { redirect } from "next/navigation";
import { encerrarSessao, exigirSessao } from "@/auth/sessao";

export async function sair() {
  await exigirSessao();
  await encerrarSessao();
  redirect("/login");
}
