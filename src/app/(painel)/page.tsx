import Link from "next/link";
import { resumoDoMes } from "@/custos/orcamento";
import { formatarDataHora } from "@/lib/datas";
import { obterDb } from "@/lib/db";
import { PainelGasto } from "./painel-gasto";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const db = obterDb();
  const [resumo, jobs] = await Promise.all([
    resumoDoMes(db),
    db.job.findMany({ orderBy: { criadoEm: "desc" }, take: 10 }),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Início</h1>
      <PainelGasto resumo={resumo} />
      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Últimos jobs</h2>
          <Link href="/configuracoes/sistema" className="text-sm underline">
            Ver todos
          </Link>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhum job ainda.</p>
        ) : (
          <ul className="text-sm">
            {jobs.map((j) => (
              <li key={j.id}>
                {formatarDataHora(j.criadoEm)} · {j.tipo} · {j.status.toLowerCase()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
