import Link from "next/link";
import { redirect } from "next/navigation";
import { BarraEtapas } from "@/componentes/barra-etapas";
import { ListaFaltantes } from "@/componentes/lista-faltantes";
import { PERGUNTAS_POR_ETAPA } from "@/briefing/campos";
import { carregarPaginaBriefing } from "@/briefing/pagina";
import { ETAPAS_BRIEFING } from "@/contas/rotulos";
import { FormularioBriefing } from "./formulario-briefing";
import { EtapaReferencias } from "./referencias/etapa-referencias";

export const dynamic = "force-dynamic";

export default async function PaginaBriefing({
  params,
  searchParams,
}: {
  params: Promise<{ contaId: string }>;
  searchParams: Promise<{ etapa?: string }>;
}) {
  const { contaId } = await params;
  const etapaBruta = Number((await searchParams).etapa ?? "1");
  const dados = await carregarPaginaBriefing(contaId);
  const { conta, produto } = dados;
  if (etapaBruta === 6) redirect(`/contas/${conta.id}/produtos/${produto.id}/ficha`);
  const etapa = Number.isInteger(etapaBruta) && etapaBruta >= 1 && etapaBruta <= 5 ? etapaBruta : 1;
  const href = (n: number) => `/contas/${conta.id}/briefing?etapa=${n}`;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/contas" className="underline">
            Contas
          </Link>{" "}
          /{" "}
          <Link href={`/contas/${conta.id}`} className="underline">
            {conta.nome}
          </Link>{" "}
          / Briefing
        </p>
        <h1 className="text-2xl font-semibold">Briefing de {conta.nome}</h1>
        <p className="text-sm text-slate-600">
          Suas respostas são salvas sozinhas. Pode sair e continuar depois de onde parou.
        </p>
      </div>
      {dados.somenteLeitura && (
        <p role="status" className="rounded bg-slate-100 p-3 text-sm text-slate-700">
          Esta conta está arquivada. As respostas ficam disponíveis só para leitura.
        </p>
      )}
      <BarraEtapas etapas={ETAPAS_BRIEFING} atual={etapa} href={href} />

      {etapa <= 4 ? (
        <>
          <FormularioBriefing
            contaId={conta.id}
            produtoId={produto.id}
            etapa={etapa}
            perguntas={PERGUNTAS_POR_ETAPA[etapa]}
            marca={dados.marca}
            produto={{ ...dados.briefingProduto, nome: produto.nome }}
            isca={dados.isca}
            somenteLeitura={dados.somenteLeitura}
            navegacao={{
              anterior: etapa > 1 ? { href: href(etapa - 1), etapa: etapa - 1 } : undefined,
              proxima: { href: href(etapa + 1), etapa: etapa + 1, rotulo: "Próxima etapa" },
            }}
          />
          {etapa === 4 && (
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <ListaFaltantes faltando={dados.faltando} />
            </section>
          )}
        </>
      ) : (
        <EtapaReferencias contaId={conta.id} produtoId={produto.id} somenteLeitura={dados.somenteLeitura} faltando={dados.faltando} />
      )}
    </div>
  );
}
