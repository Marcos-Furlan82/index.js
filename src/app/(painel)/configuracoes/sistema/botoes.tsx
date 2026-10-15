"use client";

import { useActionState } from "react";
import { enfileirarPing, tentarDeNovo, type EstadoAcao } from "./actions";

const inicial: EstadoAcao = {};

export function Mensagem({ estado }: { estado: EstadoAcao }) {
  if (estado.erro) return <p role="alert" className="text-sm text-red-700">{estado.erro}</p>;
  if (estado.ok) return <p className="text-sm text-green-700">{estado.ok}</p>;
  return null;
}

export function BotaoPing() {
  const [estado, acao, pendente] = useActionState(async () => enfileirarPing(), inicial);
  return (
    <form action={acao} className="flex items-center gap-3">
      <button type="submit" disabled={pendente} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60">
        Enfileirar ping
      </button>
      <Mensagem estado={estado} />
    </form>
  );
}

export function BotaoTentarDeNovo({ jobId }: { jobId: string }) {
  const [estado, acao, pendente] = useActionState(tentarDeNovo, inicial);
  return (
    <form action={acao}>
      <input type="hidden" name="jobId" value={jobId} />
      <button type="submit" disabled={pendente} className="text-sm text-blue-700 underline disabled:opacity-60">
        Tentar de novo
      </button>
      <Mensagem estado={estado} />
    </form>
  );
}
