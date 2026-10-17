import Link from "next/link";
import type { Faltante } from "@/briefing/obrigatorios";

/** "Para gerar a ficha do produto, falta responder:" com links para cada pergunta. */
export function ListaFaltantes({ faltando }: { faltando: Faltante[] }) {
  if (faltando.length === 0) {
    return <p className="text-sm text-emerald-700">Tudo pronto para gerar a ficha do produto.</p>;
  }
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">Para gerar a ficha do produto, falta responder:</p>
      <ul className="list-inside list-disc">
        {faltando.map((f) => (
          <li key={f.campo}>
            <Link href={f.link} className="underline">
              {f.rotulo}
            </Link>{" "}
            <span className="text-slate-500">(etapa {f.etapa})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
