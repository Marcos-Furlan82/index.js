import Link from "next/link";
import { notFound } from "next/navigation";
import { buscarSugestao } from "@/briefing/sugestoes-isca";
import { faltandoParaGerar } from "@/briefing/obrigatorios";
import { AtualizarEnquantoGera } from "@/componentes/atualizar-enquanto-gera";
import { FormularioAcao } from "@/componentes/formulario-acao";
import { ListaFaltantes } from "@/componentes/lista-faltantes";
import { podeGastar } from "@/custos/orcamento";
import { BLOCOS_FICHA } from "@/especialistas/produto/esquema";
import { estadoGeracao, MAX_INSTRUCAO, mensagemBloqueioOrcamento } from "@/especialistas/produto/fichas";
import { lerFicha, mensagemErroFicha, prepararGeracao } from "@/especialistas/produto/gerar";
import { bloqueiosAprovacao, blocosComInferido, chavePendencia } from "@/especialistas/produto/regras";
import { formatarDataHora } from "@/lib/datas";
import { obterDb } from "@/lib/db";
import { formatarBRL } from "@/lib/dinheiro";
import { aprovarFichaAcao, dispensarPendenciaAcao, gerarFichaAcao, tentarDeNovoFichaAcao } from "./actions";
import { BlocoFicha } from "./bloco-ficha";

export const dynamic = "force-dynamic";

const CARTAO = "space-y-3 rounded-lg border border-slate-200 bg-white p-4";
const UUID = /^[0-9a-f-]{36}$/i;

function Ocultos({ contaId, produtoId }: { contaId: string; produtoId: string }) {
  return (
    <>
      <input type="hidden" name="contaId" value={contaId} />
      <input type="hidden" name="produtoId" value={produtoId} />
    </>
  );
}

const ROTULO_STATUS = { RASCUNHO: "Em revisão", APROVADA: "Aprovada", SUBSTITUIDA: "Substituída" } as const;

export default async function PaginaFicha({
  params,
  searchParams,
}: {
  params: Promise<{ contaId: string; produtoId: string }>;
  searchParams: Promise<{ versao?: string }>;
}) {
  const { contaId, produtoId } = await params;
  if (!UUID.test(contaId) || !UUID.test(produtoId)) notFound();
  const db = obterDb();
  const produto = await db.produto.findUnique({ where: { id: produtoId }, include: { conta: true, isca: true } });
  if (!produto || produto.contaId !== contaId) notFound();
  const conta = produto.conta;
  const somenteLeitura = !!conta.arquivadaEm || !!produto.arquivadoEm;

  const versoes = await db.fichaProduto.findMany({
    where: { produtoId },
    orderBy: { versao: "desc" },
    select: { id: true, versao: true, status: true, origem: true, criadoEm: true },
  });
  const pedida = Number((await searchParams).versao);
  const escolhida = versoes.find((v) => v.versao === pedida) ?? versoes[0];
  const registro = escolhida ? await db.fichaProduto.findUniqueOrThrow({ where: { id: escolhida.id } }) : null;
  const ficha = registro ? lerFicha(registro.conteudo) : null;
  const maisRecente = !!registro && registro.versao === versoes[0]?.versao;
  const aprovada = versoes.find((v) => v.status === "APROVADA");

  const [estado, prep] = await Promise.all([
    estadoGeracao(produto.geracaoJobId, db),
    somenteLeitura ? null : prepararGeracao(produtoId, { baseVersao: registro?.versao ?? null }, db),
  ]);
  const faltando = prep ? faltandoParaGerar(prep.ctx) : [];
  const decisao = prep?.estimativa.ok ? await podeGastar(contaId, prep.estimativa.maximoBrl, db) : null;
  const bloqueioOrcamento = prep ? mensagemBloqueioOrcamento(prep.estimativa, decisao) : null;
  const custoMaximo = prep?.estimativa.ok ? formatarBRL(prep.estimativa.maximoBrl) : null;
  const linkBriefing = conta.produtoPrincipalId === produtoId ? `/contas/${contaId}/briefing?etapa=1` : `/contas/${contaId}/produtos/${produtoId}`;
  const ocultos = { contaId, produtoId };
  const iscaTexto = produto.isca
    ? produto.isca.escolha === "SEM_ISCA"
      ? "Sem isca neste ciclo"
      : `${produto.isca.descricao ?? buscarSugestao(produto.isca.sugestaoChave)?.titulo ?? ""}${produto.isca.pronta ? "" : " (ainda não pronta)"}`
    : null;

  const motivos = ficha && registro ? bloqueiosAprovacao(ficha, registro.blocosRevisados) : [];
  const inferidos = ficha ? blocosComInferido(ficha) : [];
  const pendencias = ficha?.pendencias.filter((p) => !registro?.pendenciasDispensadas.includes(chavePendencia(p))) ?? [];


  const botaoGerar = (rotulo: string, comInstrucao: boolean) =>
    faltando.length > 0 ? (
      <ListaFaltantes faltando={faltando} />
    ) : bloqueioOrcamento ? (
      <div className="space-y-2">
        <p role="alert" className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          {bloqueioOrcamento.erro}
        </p>
        <Link href="/configuracoes/orcamento" className="inline-block rounded border border-slate-300 px-3 py-2 text-sm">
          {decisao?.motivo === "teto_geral" || decisao?.motivo === "teto_conta" ? "Ajustar orçamento" : "Ir para Orçamento"}
        </Link>
      </div>
    ) : (
      <FormularioAcao acao={gerarFichaAcao} rotuloBotao={rotulo}>
        <Ocultos {...ocultos} />
        {comInstrucao && (
          <>
            <input type="hidden" name="baseVersao" value={registro?.versao ?? ""} />
            <label className="block text-sm">
              O que mudar? (opcional)
              <textarea name="instrucao" rows={2} maxLength={MAX_INSTRUCAO} className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            </label>
          </>
        )}
        <p className="text-xs text-slate-500">Custo: no máximo {custoMaximo} (o valor real costuma ser bem menor).</p>
      </FormularioAcao>
    );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/contas" className="underline">
            Contas
          </Link>{" "}
          /{" "}
          <Link href={`/contas/${contaId}`} className="underline">
            {conta.nome}
          </Link>{" "}
          / Ficha do produto
        </p>
        <h1 className="text-2xl font-semibold">Ficha do produto: {produto.nome}</h1>
        <p className="rounded bg-blue-50 p-2 text-sm text-blue-900">
          Confira com calma. A IA pode errar ou inventar detalhes. Nada é publicado nesta etapa.
        </p>
      </div>

      {estado.fase === "gerando" && (
        <section className={CARTAO} role="status">
          <AtualizarEnquantoGera />
          <p className="font-medium">Montando sua ficha… pode levar alguns instantes.</p>
          <p className="text-sm text-slate-600">Você pode sair desta tela, avisamos quando ficar pronta.</p>
        </section>
      )}

      {estado.fase === "erro" && !somenteLeitura && (
        <section className={CARTAO} role="alert">
          <p className="font-medium text-red-800">{mensagemErroFicha(estado.codigo)}</p>
          {estado.codigo.startsWith("orcamento:") ? (
            <Link href="/configuracoes/orcamento" className="inline-block rounded border border-slate-300 px-3 py-2 text-sm">
              Ajustar orçamento
            </Link>
          ) : (
            <FormularioAcao acao={tentarDeNovoFichaAcao} rotuloBotao="Tentar de novo">
              <Ocultos {...ocultos} />
            </FormularioAcao>
          )}
        </section>
      )}

      {!ficha && estado.fase !== "gerando" && (
        <section className={CARTAO}>
          <h2 className="text-lg font-medium">A ficha ainda não foi gerada</h2>
          <p className="text-sm text-slate-600">
            A IA monta a ficha a partir das suas respostas. Depois você revisa bloco a bloco e aprova.
          </p>
          {!somenteLeitura && botaoGerar("Gerar a ficha do produto", false)}
        </section>
      )}

      {ficha && registro && (
        <>
          <section className={CARTAO}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-medium">Versão {registro.versao}</span>
              <span className="rounded bg-slate-100 px-2 text-sm">{ROTULO_STATUS[registro.status]}</span>
              <span className="text-sm text-slate-500">
                {registro.origem === "IA" ? "gerada pela IA" : "editada por você"} em {formatarDataHora(registro.criadoEm)}
              </span>
              {versoes.length > 1 && (
                <nav className="ml-auto flex flex-wrap gap-2 text-sm" aria-label="Versões">
                  {versoes.map((v) => (
                    <Link
                      key={v.id}
                      href={`?versao=${v.versao}`}
                      className={`rounded px-2 py-1 ${v.versao === registro.versao ? "bg-slate-900 text-white" : "border border-slate-300"}`}
                    >
                      v{v.versao}
                      {v.status === "APROVADA" ? " ✓" : ""}
                    </Link>
                  ))}
                </nav>
              )}
            </div>
            {!maisRecente && <p className="text-sm text-amber-700">Você está vendo uma versão antiga (só leitura).</p>}
            {registro.instrucao && <p className="text-sm text-slate-600">Pedido desta versão: {registro.instrucao}</p>}
            {aprovada && aprovada.versao !== registro.versao && (
              <p className="text-sm text-slate-600">A versão {aprovada.versao} é a aprovada em uso.</p>
            )}
          </section>

          {BLOCOS_FICHA.map((b) => (
            <BlocoFicha
              key={`${registro.id}-${b.chave}`}
              contaId={contaId}
              produtoId={produtoId}
              fichaId={registro.id}
              bloco={b.chave}
              titulo={b.titulo}
              ficha={ficha}
              iscaTexto={iscaTexto}
              inferido={inferidos.includes(b.chave)}
              revisado={registro.blocosRevisados.includes(b.chave)}
              podeRevisar={!somenteLeitura && maisRecente && registro.status === "RASCUNHO"}
              podeEditar={!somenteLeitura && maisRecente}
              linkBriefing={linkBriefing}
            />
          ))}

          <section className={CARTAO} id="bloco-pendencias">
            <h2 className="text-lg font-medium">Pendências</h2>
            {pendencias.length === 0 ? (
              <p className="text-sm text-emerald-700">Nenhuma pendência.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {pendencias.map((p) => (
                  <li key={chavePendencia(p)} className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded px-2 text-xs ${p.criticidade === "bloqueia" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}
                    >
                      {p.criticidade === "bloqueia" ? "impede aprovar" : "sugestão"}
                    </span>
                    <span>{p.pergunta}</span>
                    <span className="text-xs text-slate-500">
                      ({BLOCOS_FICHA.find((b) => (b.campos as readonly string[]).includes(p.campo))?.titulo})
                    </span>
                    {p.criticidade === "melhora" && !somenteLeitura && maisRecente && (
                      <FormularioAcao acao={dispensarPendenciaAcao} rotuloBotao="Dispensar" estiloBotao="link" className="inline">
                        <Ocultos {...ocultos} />
                        <input type="hidden" name="fichaId" value={registro.id} />
                        <input type="hidden" name="chave" value={chavePendencia(p)} />
                      </FormularioAcao>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {!somenteLeitura && maisRecente && (
            <section className={CARTAO}>
              {registro.status === "APROVADA" ? (
                <p className="text-emerald-700">Ficha aprovada. Você pode editá-la quando quiser.</p>
              ) : motivos.length > 0 ? (
                <div className="space-y-2">
                  <button type="button" disabled className="rounded bg-slate-300 px-3 py-2 text-sm text-slate-700">
                    Aprovar ficha
                  </button>
                  <ul className="list-inside list-disc text-sm text-slate-700">
                    {motivos.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <FormularioAcao acao={aprovarFichaAcao} rotuloBotao="Aprovar ficha">
                  <Ocultos {...ocultos} />
                  <input type="hidden" name="fichaId" value={registro.id} />
                </FormularioAcao>
              )}
              {estado.fase !== "gerando" && (
                <details className="pt-2">
                  <summary className="cursor-pointer text-sm font-medium">Gerar outra versão</summary>
                  <div className="pt-2">{botaoGerar("Gerar outra versão", true)}</div>
                </details>
              )}
              <Link href={linkBriefing} className="inline-block text-sm underline">
                Voltar ao briefing
              </Link>
            </section>
          )}
        </>
      )}
    </div>
  );
}
