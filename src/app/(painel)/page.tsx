import Link from "next/link";
import { listarContas } from "@/contas/contas";
import { rotuloFicha, TOTAL_ETAPAS } from "@/contas/rotulos";
import { resumoDoMes } from "@/custos/orcamento";
import { formatarDataHora } from "@/lib/datas";
import { obterDb } from "@/lib/db";
import { PainelGasto } from "./painel-gasto";

export const dynamic = "force-dynamic";

export default async function Inicio() {
  const db = obterDb();
  const [resumo, jobs, contas] = await Promise.all([
    resumoDoMes(db),
    db.job.findMany({ orderBy: { criadoEm: "desc" }, take: 10 }),
    listarContas({}, db),
  ]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Início</h1>
      <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Contas</h2>
          <Link href="/contas" className="text-sm underline">
            Ver todas
          </Link>
        </div>
        {contas.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma conta ainda.{" "}
            <Link href="/contas" className="underline">
              Cadastre a primeira
            </Link>
            .
          </p>
        ) : (
          <ul className="text-sm">
            {contas.map((c) => (
              <li key={c.id}>
                <Link href={`/contas/${c.id}`} className="underline">
                  {c.nome}
                </Link>{" "}
                · briefing {c.referenciasConcluidas ? "concluído" : `etapa ${c.etapaAtual} de ${TOTAL_ETAPAS}`} · ficha principal{" "}
                {rotuloFicha(c.produtoPrincipal?.ficha)}
              </li>
            ))}
          </ul>
        )}
      </section>
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
