"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ResultadoAutosave = { ok: true; salvoEm: string } | { ok: false; erro: string };

export type EstadoAutosave =
  | { fase: "ocioso" }
  | { fase: "pendente" }
  | { fase: "salvando" }
  | { fase: "salvo"; em: Date }
  | { fase: "erro"; mensagem: string };

export const INTERVALO_AUTOSAVE_MS = 10_000;

/**
 * Autosave: as mudanças se acumulam por chave e são enviadas no blur
 * (salvarAgora) ou 10 s depois da última alteração. Um envio de cada vez;
 * se falhar, as mudanças voltam para a fila (as mais novas prevalecem).
 */
export function useAutosave(
  salvar: (mudancas: Record<string, unknown>) => Promise<ResultadoAutosave>,
  intervaloMs = INTERVALO_AUTOSAVE_MS,
) {
  const pendentes = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emAndamento = useRef<Promise<boolean> | null>(null);
  const salvarRef = useRef(salvar);
  const [estado, setEstado] = useState<EstadoAutosave>({ fase: "ocioso" });

  useEffect(() => {
    salvarRef.current = salvar;
  }, [salvar]);

  const salvarAgora = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    if (emAndamento.current) await emAndamento.current;
    const lote = pendentes.current;
    if (Object.keys(lote).length === 0) return true;
    pendentes.current = {};
    setEstado({ fase: "salvando" });
    const envio = (async () => {
      try {
        const r = await salvarRef.current(lote);
        if (!r.ok) {
          pendentes.current = { ...lote, ...pendentes.current };
          setEstado({ fase: "erro", mensagem: r.erro });
          return false;
        }
        setEstado(Object.keys(pendentes.current).length > 0 ? { fase: "pendente" } : { fase: "salvo", em: new Date(r.salvoEm) });
        return true;
      } catch {
        pendentes.current = { ...lote, ...pendentes.current };
        setEstado({ fase: "erro", mensagem: "Sem conexão. Tentaremos de novo." });
        return false;
      }
    })();
    emAndamento.current = envio;
    const ok = await envio;
    emAndamento.current = null;
    return ok;
  }, []);

  const registrar = useCallback(
    (chave: string, valor: unknown, imediato = false) => {
      pendentes.current = { ...pendentes.current, [chave]: valor };
      setEstado({ fase: "pendente" });
      clearTimeout(timer.current);
      if (imediato) void salvarAgora();
      else timer.current = setTimeout(() => void salvarAgora(), intervaloMs);
    },
    [intervaloMs, salvarAgora],
  );

  // Avisa antes de fechar a aba com algo não salvo.
  useEffect(() => {
    function antesDeSair(e: BeforeUnloadEvent) {
      if (Object.keys(pendentes.current).length > 0) e.preventDefault();
    }
    window.addEventListener("beforeunload", antesDeSair);
    return () => {
      window.removeEventListener("beforeunload", antesDeSair);
      clearTimeout(timer.current);
    };
  }, []);

  return { estado, registrar, salvarAgora };
}
