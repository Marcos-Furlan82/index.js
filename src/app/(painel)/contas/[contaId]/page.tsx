import Link from "next/link";
import { notFound } from "next/navigation";
import { FormularioAcao } from "@/componentes/formulario-acao";
import { rotuloFicha, TOTAL_ETAPAS } from "@/contas/rotulos";
import { obterDb } from "@/lib/db";
import {
  arquivarContaAcao,
  arquivarProdutoAcao,
  criarProdutoAcao,
  definirPrincipalAcao,
  editarContaAcao,
} from "../actions";

export const dynamic = "force-dynamic";

const CAMPO = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm";
const CARTAO = "space-y-3 rounded-lg border border-slate-200 bg-white p-4";

export default async function PaginaConta({ params }: { params: Promise<{ contaId: string }> }) {
  const { contaId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(contaId)) notFound();
  const conta = await obterDb().contaInstagram.findUnique({
    where: { id: contaId },
    include: {
      marca: true,
      produtos: {
        where: { arquivadoEm: null },
        orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
        include: { fichas: { orderBy: { versao: "desc" }, take: 1, select: { status: true, versao: true } } },
      },
    },
  });
  if (!conta) notFound();
  const somenteLeitura = !!conta.arquivadaEm;
  const etapa = conta.marca?.etapaAtual ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/contas" className="underline">
            Contas
          </Link>{" "}
          / {conta.nome}
        </p>
        <h1 className="text-2xl font-semibold">
          {conta.nome}
          {conta.usuarioInstagram && <span className="ml-2 text-base font-normal text-slate-500">@{conta.usuarioInstagram}</span>}
        </h1>
      </div>

      {somenteLeitura && (
        <p role="status" className="rounded bg-slate-100 p-3 text-sm text-slate-700">
          Esta conta está arquivada. Os dados ficam disponíveis só para leitura.
        </p>
      )}

      <section className={CARTAO}>
        <h2 className="text-lg font-medium">Briefing</h2>
        {conta.marca?.referenciasConcluidasEm ? (
          <p className="text-sm text-slate-700">Briefing concluído. Você pode revisar qualquer etapa quando quiser.</p>
        ) : conta.marca?.briefingIniciadoEm ? (
          <p className="text-sm text-slate-700">
            Briefing em andamento — continuar de onde parou (etapa {etapa} de {TOTAL_ETAPAS}).
          </p>
        ) : (
          <p className="text-sm text-slate-700">O briefing ainda não foi começado. Leva uns 15 minutos.</p>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={`/contas/${conta.id}/briefing?etapa=${etapa}`} className="rounded bg-slate-900 px-3 py-2 text-white">
            {conta.marca?.briefingIniciadoEm ? "Continuar de onde parou" : "Começar o briefing"}
          </Link>
          <Link href={`/contas/${conta.id}/briefing?etapa=5`} className="rounded border border-slate-300 px-3 py-2">
            Referências visuais
          </Link>
        </div>
      </section>

      <section className={CARTAO}>
        <h2 className="text-lg font-medium">Produtos</h2>
        <p className="text-sm text-slate-600">
          O produto principal é o foco do briefing. Os outros produtos têm a própria ficha, com as perguntas que mudam
          de um produto para outro.
        </p>
        <ul className="divide-y divide-slate-100 text-sm">
          {conta.produtos.map((p) => {
            const principal = p.id === conta.produtoPrincipalId;
            const linkBriefing = principal ? `/contas/${conta.id}/briefing?etapa=1` : `/contas/${conta.id}/produtos/${p.id}`;
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="font-medium">{p.nome}</span>
                {principal && <span className="rounded bg-emerald-100 px-2 text-xs text-emerald-800">principal</span>}
                <span className="text-slate-600">Ficha: {rotuloFicha(p.fichas[0])}</span>
                <span className="ml-auto flex flex-wrap items-center gap-3">
                  <Link href={linkBriefing} className="underline">
                    Respostas
                  </Link>
                  <Link href={`/contas/${conta.id}/produtos/${p.id}/ficha`} className="underline">
                    Ficha do produto
                  </Link>
                  {!somenteLeitura && !principal && (
                    <>
                      <FormularioAcao acao={definirPrincipalAcao} rotuloBotao="Tornar principal" estiloBotao="link" className="inline">
                        <input type="hidden" name="contaId" value={conta.id} />
                        <input type="hidden" name="produtoId" value={p.id} />
                      </FormularioAcao>
                      <FormularioAcao acao={arquivarProdutoAcao} rotuloBotao="Arquivar" estiloBotao="link" className="inline">
                        <input type="hidden" name="contaId" value={conta.id} />
                        <input type="hidden" name="produtoId" value={p.id} />
                      </FormularioAcao>
                    </>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {!somenteLeitura && (
          <FormularioAcao acao={criarProdutoAcao} rotuloBotao="Adicionar produto" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="contaId" value={conta.id} />
            <label className="block text-sm">
              Outro produto que você vende
              <input name="nome" required maxLength={120} placeholder="Mentoria individual" className={CAMPO} />
            </label>
          </FormularioAcao>
        )}
      </section>

      {!somenteLeitura && (
        <div className="grid gap-6 md:grid-cols-2">
          <section className={CARTAO}>
            <h2 className="text-lg font-medium">Dados da conta</h2>
            <FormularioAcao acao={editarContaAcao} rotuloBotao="Salvar">
              <input type="hidden" name="contaId" value={conta.id} />
              <label className="block text-sm">
                Nome da marca ou do negócio
                <input name="nome" required maxLength={80} defaultValue={conta.nome} className={CAMPO} />
              </label>
              <label className="block text-sm">
                @ no Instagram (opcional)
                <input name="usuarioInstagram" maxLength={31} defaultValue={conta.usuarioInstagram ?? ""} className={CAMPO} />
              </label>
            </FormularioAcao>
          </section>
          <section className={CARTAO}>
            <h2 className="text-lg font-medium">Arquivar conta</h2>
            <p className="text-sm text-slate-600">
              A conta sai do seletor e fica só para leitura. Nada é apagado.
            </p>
            <FormularioAcao acao={arquivarContaAcao} rotuloBotao="Arquivar conta">
              <input type="hidden" name="contaId" value={conta.id} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirmo" value="sim" /> Entendo que a conta fica só para leitura.
              </label>
            </FormularioAcao>
          </section>
        </div>
      )}
    </div>
  );
}
