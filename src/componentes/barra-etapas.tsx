import Link from "next/link";

/** "Etapa X de N" com links para cada etapa. */
export function BarraEtapas({
  etapas,
  atual,
  href,
}: {
  etapas: readonly { numero: number; nome: string }[];
  atual: number;
  href: (numero: number) => string;
}) {
  return (
    <nav aria-label="Etapas do briefing" className="space-y-2">
      <p className="text-sm text-slate-600">
        Etapa {atual} de {etapas.length}
      </p>
      <ol className="flex flex-wrap gap-2 text-sm">
        {etapas.map((e) => (
          <li key={e.numero}>
            <Link
              href={href(e.numero)}
              aria-current={e.numero === atual ? "step" : undefined}
              className={`block rounded px-3 py-1 ${
                e.numero === atual ? "bg-slate-900 text-white" : "border border-slate-300 bg-white hover:bg-slate-50"
              }`}
            >
              {e.numero}. {e.nome}
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
