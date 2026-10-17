import Link from "next/link";
import { redirect } from "next/navigation";
import { ListaFaltantes } from "@/componentes/lista-faltantes";
import { PERGUNTAS_SECUNDARIO } from "@/briefing/campos";
import { carregarPaginaBriefing } from "@/briefing/pagina";
import { FormularioBriefing } from "../../briefing/formulario-briefing";

export const dynamic = "force-dynamic";

/** Produto secundário: as perguntas que mudam por produto, numa página só. */
export default async function PaginaProduto({ params }: { params: Promise<{ contaId: string; produtoId: string }> }) {
  const { contaId, produtoId } = await params;
  const dados = await carregarPaginaBriefing(contaId, produtoId);
  const { conta, produto } = dados;
  if (dados.principal) redirect(`/contas/${conta.id}/briefing?etapa=1`);
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
          / {produto.nome}
        </p>
        <h1 className="text-2xl font-semibold">{produto.nome}</h1>
        <p className="text-sm text-slate-600">
          Nicho, objetivo, tom de voz e datas vêm do briefing da conta. Aqui ficam só as respostas deste produto.
        </p>
      </div>
      <FormularioBriefing
        contaId={conta.id}
        produtoId={produto.id}
        etapa={null}
        perguntas={PERGUNTAS_SECUNDARIO}
        marca={dados.marca}
        produto={{ ...dados.briefingProduto, nome: produto.nome }}
        isca={dados.isca}
        somenteLeitura={dados.somenteLeitura}
        navegacao={{ proxima: { href: `/contas/${conta.id}/produtos/${produto.id}/ficha`, etapa: 0, rotulo: "Ir para a ficha do produto" } }}
      />
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <ListaFaltantes faltando={dados.faltando} />
      </section>
    </div>
  );
}
