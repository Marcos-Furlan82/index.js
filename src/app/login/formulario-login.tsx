"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "./actions";

const inicial: EstadoLogin = {};

export function FormularioLogin() {
  const [estado, acao, pendente] = useActionState(entrar, inicial);
  return (
    <form action={acao} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>
      <div>
        <label htmlFor="senha" className="block text-sm font-medium">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
        />
      </div>
      {estado.erro && (
        <p role="alert" className="text-sm text-red-700">
          {estado.erro}
        </p>
      )}
      <button
        type="submit"
        disabled={pendente}
        className="w-full rounded bg-slate-900 px-3 py-2 font-medium text-white disabled:opacity-60"
      >
        {pendente ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
