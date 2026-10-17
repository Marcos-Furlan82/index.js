import Link from "next/link";
import { FormularioAcao } from "@/componentes/formulario-acao";
import { listarContas } from "@/contas/contas";
import { rotuloFicha, TOTAL_ETAPAS } from "@/contas/rotulos";
import { criarContaAcao } from "./actions";

export const dynamic = "force-dynamic";

const CAMPO = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm";
const CARTAO = "space-y-3 rounded-lg border border-slate-200 bg-white p-4";

export default async function PaginaContas() {
  const [contas, arquivadas] = await Promise.all([listarContas(), listarContas({ arquivadas: true })]);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Contas</h1>

      {contas.length === 0 && (
        <p className="text-sm text-slate-600">Nenhuma conta ainda. Comece cadastrando a primeira abaixo.</p>
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {contas.map((c) => (
          <li key={c.id} className={CARTAO}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-lg font-medium">{c.nome}</h2>
              {c.usuarioInstagram && <span className="text-sm text-slate-500">@{c.usuarioInstagram}</span>}
            </div>
            <ul className="text-sm text-slate-700">
              <li>
                Briefing:{" "}
                {c.referenciasConcluidas
                  ? "concluído"
                  : c.briefingIniciado
                    ? `em andamento (etapa ${c.etapaAtual} de ${TOTAL_ETAPAS})`
                    : "não começado"}
              </li>
              <li>
                Ficha do produto principal{c.produtoPrincipal ? ` (${c.produtoPrincipal.nome})` : ""}:{" "}
                {rotuloFicha(c.produtoPrincipal?.ficha)}
              </li>
              <li>
                {c.produtos} {c.produtos === 1 ? "produto" : "produtos"}
              </li>
            </ul>
            <div className="flex gap-3 text-sm">
              <Link href={`/contas/${c.id}`} className="rounded bg-slate-900 px-3 py-2 text-white">
                Abrir
              </Link>
              {!c.referenciasConcluidas && (
                <Link href={`/contas/${c.id}/briefing?etapa=${c.etapaAtual}`} className="rounded border border-slate-300 px-3 py-2">
                  {c.briefingIniciado ? "Continuar de onde parou" : "Começar o briefing"}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      <section className={CARTAO}>
        <h2 className="text-lg font-medium">Nova conta</h2>
        <p className="text-sm text-slate-600">
          Cada conta do Instagram tem a sua marca, os seus produtos e o seu briefing.
        </p>
        <FormularioAcao acao={criarContaAcao} rotuloBotao="Criar conta e começar o briefing">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm">
              Nome da marca ou do negócio
              <input name="nome" required maxLength={80} placeholder="Doce Ateliê" className={CAMPO} />
            </label>
            <label className="block text-sm">
              @ no Instagram (opcional)
              <input name="usuarioInstagram" maxLength={31} placeholder="@doceatelie" className={CAMPO} />
            </label>
          </div>
        </FormularioAcao>
      </section>

      {arquivadas.length > 0 && (
        <details className={CARTAO}>
          <summary className="cursor-pointer text-sm font-medium">Contas arquivadas ({arquivadas.length})</summary>
          <ul className="text-sm">
            {arquivadas.map((c) => (
              <li key={c.id}>
                <Link href={`/contas/${c.id}`} className="underline">
                  {c.nome}
                </Link>{" "}
                (só leitura)
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
