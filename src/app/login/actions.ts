"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { obterIpCliente } from "@/auth/ip";
import { autenticar } from "@/auth/login";
import { gravarCookieSessao } from "@/auth/sessao";
import { obterDb } from "@/lib/db";

export type EstadoLogin = { erro?: string };

const esquema = z.object({
  email: z.string().trim().email().max(200),
  senha: z.string().min(1).max(500),
});

export async function entrar(_anterior: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const dados = esquema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!dados.success) return { erro: "Informe e-mail e senha." };

  const h = await headers();
  const resultado = await autenticar(obterDb(), {
    ...dados.data,
    ip: obterIpCliente(h),
    userAgent: h.get("user-agent"),
  });
  if (!resultado.ok) return { erro: resultado.erro };

  await gravarCookieSessao(resultado.token, resultado.expiraEm);
  redirect("/");
}
