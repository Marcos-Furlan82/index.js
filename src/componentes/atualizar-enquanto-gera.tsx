"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Recarrega os dados da página a cada 10 s enquanto algo está sendo gerado. */
export function AtualizarEnquantoGera({ intervaloMs = 10_000 }: { intervaloMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), intervaloMs);
    return () => clearInterval(t);
  }, [router, intervaloMs]);
  return null;
}
