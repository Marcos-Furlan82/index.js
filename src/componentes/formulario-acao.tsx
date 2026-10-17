"use client";

import { useActionState } from "react";

export type EstadoFormulario = { ok?: string; erro?: string };

type Props = {
  acao: (anterior: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;
  rotuloBotao: string;
  children?: React.ReactNode;
  className?: string;
  estiloBotao?: "primario" | "link";
};

/** Formulário com server action, mensagem de retorno e botão desabilitado durante o envio. */
export function FormularioAcao({ acao, rotuloBotao, children, className, estiloBotao = "primario" }: Props) {
  const [estado, executar, pendente] = useActionState(acao, {});
  const classeBotao =
    estiloBotao === "link"
      ? "text-sm text-red-700 underline disabled:opacity-60"
      : "rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60";
  return (
    <form action={executar} className={className ?? "space-y-3"}>
      {children}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pendente} className={classeBotao}>
          {pendente ? "Salvando..." : rotuloBotao}
        </button>
        {estado.erro && (
          <p role="alert" className="text-sm text-red-700">
            {estado.erro}
          </p>
        )}
        {estado.ok && <p className="text-sm text-green-700">{estado.ok}</p>}
      </div>
    </form>
  );
}
