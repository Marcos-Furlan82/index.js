"use client";

import { useState } from "react";

/** Lista de palavras: digite e aperte Enter (ou vírgula). */
export function CampoTags({
  id,
  valores,
  aoMudar,
  placeholder,
  desabilitado,
}: {
  id: string;
  valores: string[];
  aoMudar: (valores: string[]) => void;
  placeholder?: string;
  desabilitado?: boolean;
}) {
  const [texto, setTexto] = useState("");
  function adicionar() {
    const novas = texto
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && t.length <= 60 && !valores.includes(t));
    setTexto("");
    if (novas.length > 0) aoMudar([...valores, ...novas]);
  }
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-2">
        {valores.map((v) => (
          <li key={v} className="flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-sm">
            {v}
            {!desabilitado && (
              <button type="button" aria-label={`Remover ${v}`} onClick={() => aoMudar(valores.filter((x) => x !== v))}>
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
      {!desabilitado && (
        <input
          id={id}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              adicionar();
            }
          }}
          onBlur={adicionar}
          placeholder={placeholder}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
