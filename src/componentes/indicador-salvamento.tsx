"use client";

import { useEffect, useState } from "react";
import type { EstadoAutosave } from "./use-autosave";

function hora(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** "Salvando…", "Salvo agora", "Salvo às 14:32" ou o erro. */
export function IndicadorSalvamento({ estado }: { estado: EstadoAutosave }) {
  const [, setTique] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTique((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  let texto = "";
  let classe = "text-slate-500";
  if (estado.fase === "salvando") texto = "Salvando…";
  else if (estado.fase === "pendente") texto = "Alterações ainda não salvas";
  else if (estado.fase === "salvo") {
    // eslint-disable-next-line react-hooks/purity -- o tique de 15 s re-renderiza de propósito
    texto = Date.now() - estado.em.getTime() < 60_000 ? "Salvo agora" : `Salvo às ${hora(estado.em)}`;
    classe = "text-emerald-700";
  } else if (estado.fase === "erro") {
    texto = `Não foi possível salvar: ${estado.mensagem}`;
    classe = "text-red-700";
  }
  return (
    <p aria-live="polite" className={`min-h-5 text-sm ${classe}`}>
      {texto}
    </p>
  );
}
