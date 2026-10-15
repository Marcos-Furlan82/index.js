import { obterDb } from "@/lib/db";
import { formatarDataHora } from "@/lib/datas";
import { BotaoPing, BotaoTentarDeNovo } from "./botoes";

export const dynamic = "force-dynamic";

const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: "Pendente",
  EXECUTANDO: "Executando",
  CONCLUIDO: "Concluído",
  FALHOU: "Falhou",
  CANCELADO: "Cancelado",
};

export default async function PaginaSistema() {
  const jobs = await obterDb().job.findMany({ orderBy: { criadoEm: "desc" }, take: 50 });
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Sistema</h1>

      <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-medium">Fila de jobs</h2>
        <p className="text-sm text-slate-600">
          O agendador roda a cada 2 minutos (só no site publicado). Use o ping para testar a fila.
        </p>
        <BotaoPing />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500">
              <tr>
                <th className="py-2 pr-4">Criado em</th>
                <th className="py-2 pr-4">Tipo</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Tentativas</th>
                <th className="py-2 pr-4">Erro</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-3 text-slate-500">
                    Nenhum job ainda.
                  </td>
                </tr>
              )}
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">{formatarDataHora(job.criadoEm)}</td>
                  <td className="py-2 pr-4">{job.tipo}</td>
                  <td className="py-2 pr-4">{ROTULO_STATUS[job.status] ?? job.status}</td>
                  <td className="py-2 pr-4">
                    {job.tentativas}/{job.maxTentativas}
                  </td>
                  <td className="max-w-md truncate py-2 pr-4 text-red-700" title={job.erro ?? undefined}>
                    {job.erro}
                  </td>
                  <td className="py-2">
                    {(job.status === "FALHOU" || job.status === "CANCELADO") && <BotaoTentarDeNovo jobId={job.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
