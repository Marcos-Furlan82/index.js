import { lerEnv } from "@/lib/env";
import { criarProvedorConsole } from "./console";
import { criarProvedorMemoria } from "./memoria";
import type { ProvedorEmail } from "./provedor";
import { criarProvedorResend } from "./resend";

let provedorAtual: ProvedorEmail | undefined;

/** Escolhe o provedor por EMAIL_PROVEDOR (resend | console | memoria). */
export function criarProvedorEmail(): ProvedorEmail {
  const env = lerEnv("email");
  switch (env.EMAIL_PROVEDOR) {
    case "resend":
      return criarProvedorResend({ apiKey: env.RESEND_API_KEY!, remetente: env.EMAIL_REMETENTE! });
    case "memoria":
      return criarProvedorMemoria();
    default:
      return criarProvedorConsole();
  }
}

export function obterProvedorEmail(): ProvedorEmail {
  if (!provedorAtual) provedorAtual = criarProvedorEmail();
  return provedorAtual;
}

/** Só para testes. */
export function limparProvedorEmail() {
  provedorAtual = undefined;
}

export type { MensagemEmail, ProvedorEmail } from "./provedor";
