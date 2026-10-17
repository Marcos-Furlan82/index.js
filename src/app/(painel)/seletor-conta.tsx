"use client";

import { trocarContaAtiva } from "./contas/actions";

/** Seletor da conta ativa no topo (só muda o padrão da navegação). */
export function SeletorConta({ contas, ativa }: { contas: { id: string; nome: string }[]; ativa: string | null }) {
  if (contas.length === 0) return null;
  return (
    <form action={trocarContaAtiva} className="flex items-center gap-2 text-sm">
      <label htmlFor="seletor-conta" className="text-slate-600">
        Conta
      </label>
      <select
        id="seletor-conta"
        name="contaId"
        defaultValue={ativa ?? ""}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded border border-slate-300 px-2 py-1"
      >
        {!ativa && <option value="">Escolha…</option>}
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="rounded border border-slate-300 px-2 py-1">
          Abrir
        </button>
      </noscript>
    </form>
  );
}
