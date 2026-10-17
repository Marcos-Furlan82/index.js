"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { CampoTags } from "@/componentes/campo-tags";
import { IndicadorSalvamento } from "@/componentes/indicador-salvamento";
import { ListaRepetivel } from "@/componentes/lista-repetivel";
import { useAutosave, type EstadoAutosave } from "@/componentes/use-autosave";
import { PERGUNTAS, type DefinicaoCampo } from "@/briefing/campos";
import type { DadosIsca } from "@/briefing/esquemas";
import { ENTREGAS_ISCA, ESCOLHAS_ISCA, FORMATOS_ISCA, TIPOS_DATA, TIPOS_PROVA, type Nicho } from "@/briefing/opcoes";
import { SUGESTOES_ISCA } from "@/briefing/sugestoes-isca";
import { irParaEtapaAcao, salvarIscaAcao, salvarRespostasAcao } from "./actions";

const CAMPO = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50";
const CARTAO = "space-y-4 rounded-lg border border-slate-200 bg-white p-4";

type Valores = Record<string, unknown>;

export type PropsFormulario = {
  contaId: string;
  produtoId: string;
  /** Etapa do assistente (null na página de produto secundário). */
  etapa: number | null;
  perguntas: number[];
  marca: Valores;
  produto: Valores;
  isca: DadosIsca | null;
  somenteLeitura: boolean;
  navegacao?: { anterior?: { href: string; etapa: number }; proxima?: { href: string; etapa: number; rotulo: string } };
};

function combinar(a: EstadoAutosave, b: EstadoAutosave): EstadoAutosave {
  const ordem = ["erro", "salvando", "pendente", "salvo", "ocioso"] as const;
  return ordem.indexOf(a.fase) <= ordem.indexOf(b.fase) ? a : b;
}

export function FormularioBriefing(props: PropsFormulario) {
  const router = useRouter();
  const [valores, setValores] = useState<Valores>(() => {
    const v: Valores = {};
    for (const [k, x] of Object.entries(props.marca)) v[`marca.${k}`] = x;
    for (const [k, x] of Object.entries(props.produto)) v[`produto.${k}`] = x;
    return v;
  });
  const [isca, setIsca] = useState<DadosIsca | null>(props.isca);
  const [navegando, setNavegando] = useState(false);

  const salvarRespostas = useCallback(
    (mudancas: Record<string, unknown>) =>
      salvarRespostasAcao({ contaId: props.contaId, produtoId: props.produtoId, etapa: props.etapa, mudancas }),
    [props.contaId, props.produtoId, props.etapa],
  );
  const salvarIsca = useCallback(
    (mudancas: Record<string, unknown>) =>
      salvarIscaAcao({ contaId: props.contaId, produtoId: props.produtoId, isca: mudancas.isca }),
    [props.contaId, props.produtoId],
  );
  const respostas = useAutosave(salvarRespostas);
  const autosaveIsca = useAutosave(salvarIsca);

  const chaveDe = (c: DefinicaoCampo) => `${c.alvo}.${c.chave}`;

  /** `enviado` permite guardar na tela um valor ainda incompleto (ex.: data sem nome). */
  function alterar(c: DefinicaoCampo, valor: unknown, imediato = false, enviado: unknown = valor) {
    setValores((v) => ({ ...v, [chaveDe(c)]: valor }));
    respostas.registrar(chaveDe(c), enviado, imediato);
  }

  function alterarIsca(nova: DadosIsca, imediato = false) {
    setIsca(nova);
    autosaveIsca.registrar("isca", nova, imediato);
  }

  const respondidoDepois = (valores["marca.respondidoDepois"] as string[] | undefined) ?? [];
  function alternarDepois(numero: number) {
    const chave = `pergunta-${numero}`;
    const lista = respondidoDepois.includes(chave) ? respondidoDepois.filter((x) => x !== chave) : [...respondidoDepois, chave];
    setValores((v) => ({ ...v, "marca.respondidoDepois": lista }));
    respostas.registrar("marca.respondidoDepois", lista, true);
  }

  async function navegar(destino: { href: string; etapa: number }) {
    setNavegando(true);
    const ok = (await respostas.salvarAgora()) && (await autosaveIsca.salvarAgora());
    if (!ok) {
      setNavegando(false);
      return;
    }
    if (props.etapa !== null) await irParaEtapaAcao(props.contaId, destino.etapa);
    router.push(destino.href);
  }

  const ro = props.somenteLeitura;
  const nicho = (valores["marca.nicho"] as Nicho | undefined) ?? "OUTRO";

  function renderCampo(c: DefinicaoCampo) {
    const id = `campo-${c.chave}`;
    const valor = valores[chaveDe(c)];
    const blur = () => void respostas.salvarAgora();
    if (c.mostrarSe && valores[`${c.alvo === "marca" ? "marca" : "produto"}.${c.mostrarSe.campo}`] !== c.mostrarSe.valor) {
      return null;
    }
    const rotulo = (
      <span className="text-sm font-medium">
        {c.rotulo}
        {c.obrigatorio && <span className="ml-1 text-xs font-normal text-slate-500">(necessário para a ficha)</span>}
      </span>
    );
    switch (c.tipo) {
      case "texto":
        return (
          <label key={c.chave} className="block" htmlFor={id}>
            {rotulo}
            <input
              id={id}
              value={(valor as string | undefined) ?? ""}
              maxLength={c.max}
              placeholder={c.placeholder}
              disabled={ro}
              onChange={(e) => alterar(c, e.target.value)}
              onBlur={blur}
              className={CAMPO}
            />
            {c.max && c.max <= 140 && (
              <span className="text-xs text-slate-500">
                {((valor as string | undefined) ?? "").length}/{c.max}
              </span>
            )}
          </label>
        );
      case "textoLongo":
        return (
          <label key={c.chave} className="block" htmlFor={id}>
            {rotulo}
            <textarea
              id={id}
              rows={3}
              value={(valor as string | undefined) ?? ""}
              maxLength={c.max}
              placeholder={c.placeholder}
              disabled={ro}
              onChange={(e) => alterar(c, e.target.value)}
              onBlur={blur}
              className={CAMPO}
            />
          </label>
        );
      case "numero":
        return (
          <label key={c.chave} className="block" htmlFor={id}>
            {rotulo}
            <input
              id={id}
              type="number"
              inputMode="numeric"
              min={c.min}
              max={c.max}
              value={valor === undefined || valor === null ? "" : String(valor)}
              placeholder={c.placeholder}
              disabled={ro}
              onChange={(e) => alterar(c, e.target.value === "" ? null : Math.trunc(Number(e.target.value)))}
              onBlur={blur}
              className={`${CAMPO} max-w-40`}
            />
          </label>
        );
      case "data":
        return (
          <label key={c.chave} className="block" htmlFor={id}>
            {rotulo}
            <input
              id={id}
              type="date"
              value={(valor as string | undefined) ?? ""}
              disabled={ro}
              onChange={(e) => alterar(c, e.target.value || null, true)}
              className={`${CAMPO} max-w-48`}
            />
          </label>
        );
      case "escolha":
        return (
          <fieldset key={c.chave} id={id} className="space-y-1">
            <legend>{rotulo}</legend>
            {c.opcoes?.map((o) => (
              <label key={o.valor} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name={id}
                  value={o.valor}
                  checked={valor === o.valor}
                  disabled={ro}
                  onChange={() => alterar(c, o.valor, true)}
                />
                {o.rotulo}
              </label>
            ))}
          </fieldset>
        );
      case "multipla": {
        const lista = (valor as string[] | undefined) ?? [];
        return (
          <fieldset key={c.chave} id={id} className="space-y-1">
            <legend>{rotulo}</legend>
            {c.opcoes?.map((o) => (
              <label key={o.valor} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={lista.includes(o.valor)}
                  disabled={ro}
                  onChange={(e) =>
                    alterar(c, e.target.checked ? [...lista, o.valor] : lista.filter((x) => x !== o.valor), true)
                  }
                />
                {o.rotulo}
              </label>
            ))}
          </fieldset>
        );
      }
      case "simNao":
        return (
          <fieldset key={c.chave} id={id} className="space-y-1">
            <legend>{rotulo}</legend>
            {[
              { v: true, r: "Sim" },
              { v: false, r: "Não" },
            ].map((o) => (
              <label key={o.r} className="mr-4 inline-flex items-center gap-2 text-sm">
                <input type="radio" name={id} checked={valor === o.v} disabled={ro} onChange={() => alterar(c, o.v, true)} />
                {o.r}
              </label>
            ))}
          </fieldset>
        );
      case "tags":
        return (
          <div key={c.chave} className="space-y-1">
            <label htmlFor={id}>{rotulo}</label>
            <CampoTags
              id={id}
              valores={(valor as string[] | undefined) ?? []}
              aoMudar={(v) => alterar(c, v, true)}
              placeholder={c.placeholder}
              desabilitado={ro}
            />
          </div>
        );
      case "provas":
        return (
          <div key={c.chave} id={id} className="space-y-2">
            {rotulo}
            <ListaRepetivel
              itens={(valor as ProvaForm[] | undefined) ?? []}
              desabilitado={ro}
              maximo={20}
              rotuloAdicionar="Adicionar prova"
              novoItem={() => ({ id: crypto.randomUUID(), tipo: "DEPOIMENTO", conteudo: "", fonte: "", autorizadoUso: false })}
              aoMudar={(itens, imediato) => alterar(c, itens, imediato)}
              renderItem={(p, atualizar) => (
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="block text-sm">
                    Tipo
                    <select
                      value={p.tipo}
                      disabled={ro}
                      onChange={(e) => atualizar({ tipo: e.target.value as ProvaForm["tipo"] }, true)}
                      className={CAMPO}
                    >
                      {Object.entries(TIPOS_PROVA.rotulos).map(([v, r]) => (
                        <option key={v} value={v}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm">
                    De onde vem (fonte)
                    <input
                      value={p.fonte}
                      maxLength={200}
                      disabled={ro}
                      placeholder="Avaliações da Hotmart"
                      onChange={(e) => atualizar({ fonte: e.target.value })}
                      onBlur={blur}
                      className={CAMPO}
                    />
                  </label>
                  <label className="block text-sm md:col-span-2">
                    O que diz
                    <textarea
                      rows={2}
                      value={p.conteudo}
                      maxLength={2000}
                      disabled={ro}
                      placeholder={c.placeholder}
                      onChange={(e) => atualizar({ conteudo: e.target.value })}
                      onBlur={blur}
                      className={CAMPO}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm md:col-span-2">
                    <input
                      type="checkbox"
                      checked={p.autorizadoUso}
                      disabled={ro}
                      onChange={(e) => atualizar({ autorizadoUso: e.target.checked }, true)}
                    />
                    Tenho autorização para mostrar isto nos posts (quem aparece concordou).
                  </label>
                </div>
              )}
            />
          </div>
        );
      case "datas":
        return (
          <div key={c.chave} id={id} className="space-y-2">
            {rotulo}
            <ListaRepetivel
              itens={(valor as DataForm[] | undefined) ?? []}
              desabilitado={ro}
              maximo={30}
              rotuloAdicionar="Adicionar data"
              novoItem={() => ({ id: crypto.randomUUID(), data: "", nome: "", tipo: "SAZONAL" })}
              aoMudar={(itens, imediato) =>
                alterar(c, itens, imediato, itens.filter((d) => d.data && d.nome.trim()))
              }
              renderItem={(d, atualizar) => (
                <div className="grid gap-2 md:grid-cols-3">
                  <label className="block text-sm">
                    Data
                    <input type="date" value={d.data} disabled={ro} onChange={(e) => atualizar({ data: e.target.value })} onBlur={blur} className={CAMPO} />
                  </label>
                  <label className="block text-sm">
                    Nome
                    <input
                      value={d.nome}
                      maxLength={120}
                      disabled={ro}
                      placeholder="Dia das Mães"
                      onChange={(e) => atualizar({ nome: e.target.value })}
                      onBlur={blur}
                      className={CAMPO}
                    />
                  </label>
                  <label className="block text-sm">
                    Tipo
                    <select value={d.tipo} disabled={ro} onChange={(e) => atualizar({ tipo: e.target.value as DataForm["tipo"] }, true)} className={CAMPO}>
                      {Object.entries(TIPOS_DATA.rotulos).map(([v, r]) => (
                        <option key={v} value={v}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            />
          </div>
        );
      case "isca":
        return <CampoIsca key="isca" isca={isca} nicho={nicho} desabilitado={ro} aoMudar={alterarIsca} />;
    }
  }

  return (
    <div className="space-y-6">
      {props.perguntas.map((n) => {
        const pergunta = PERGUNTAS[n];
        const depois = respondidoDepois.includes(`pergunta-${n}`);
        return (
          <section key={n} className={CARTAO} aria-labelledby={`pergunta-${n}`}>
            <div>
              <h2 id={`pergunta-${n}`} className="text-lg font-medium">
                {pergunta.titulo}
              </h2>
              {pergunta.ajuda && <p className="text-sm text-slate-600">{pergunta.ajuda}</p>}
            </div>
            {pergunta.campos.map(renderCampo)}
            {pergunta.podeDepois && !ro && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={depois} onChange={() => alternarDepois(n)} /> Responder depois
              </label>
            )}
          </section>
        );
      })}

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-slate-200 bg-slate-50 py-3">
        <IndicadorSalvamento estado={combinar(respostas.estado, autosaveIsca.estado)} />
        <div className="ml-auto flex gap-3">
          {props.navegacao?.anterior && (
            <button
              type="button"
              disabled={navegando}
              onClick={() => navegar(props.navegacao!.anterior!)}
              className="rounded border border-slate-300 px-3 py-2 text-sm"
            >
              Voltar
            </button>
          )}
          {props.navegacao?.proxima && (
            <button
              type="button"
              disabled={navegando}
              onClick={() => navegar(props.navegacao!.proxima!)}
              className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60"
            >
              {props.navegacao.proxima.rotulo}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type ProvaForm = { id: string; tipo: keyof typeof TIPOS_PROVA.rotulos; conteudo: string; fonte: string; autorizadoUso: boolean };
type DataForm = { id: string; data: string; nome: string; tipo: keyof typeof TIPOS_DATA.rotulos };

function CampoIsca({
  isca,
  nicho,
  desabilitado,
  aoMudar,
}: {
  isca: DadosIsca | null;
  nicho: Nicho;
  desabilitado: boolean;
  aoMudar: (isca: DadosIsca, imediato?: boolean) => void;
}) {
  const atual: DadosIsca = isca ?? { escolha: "TEM", pronta: false };
  const mudar = (parcial: Partial<DadosIsca>, imediato = false) => aoMudar({ ...atual, ...parcial }, imediato);
  const sugestoes = SUGESTOES_ISCA[nicho] ?? SUGESTOES_ISCA.OUTRO;
  return (
    <div id="campo-isca" className="space-y-3">
      <fieldset className="space-y-1">
        <legend className="text-sm font-medium">
          Isca (material gratuito) <span className="text-xs font-normal text-slate-500">(necessário para a ficha)</span>
        </legend>
        {Object.entries(ESCOLHAS_ISCA.rotulos).map(([v, r]) => (
          <label key={v} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="isca-escolha"
              checked={isca?.escolha === v}
              disabled={desabilitado}
              onChange={() => aoMudar({ ...atual, escolha: v as DadosIsca["escolha"] }, true)}
            />
            {r}
          </label>
        ))}
      </fieldset>

      {isca?.escolha === "TEM" && (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            O que é
            <input
              value={atual.descricao ?? ""}
              maxLength={200}
              disabled={desabilitado}
              placeholder="Apostila com 10 receitas que mais vendem"
              onChange={(e) => mudar({ descricao: e.target.value })}
              onBlur={() => mudar({}, true)}
              className={CAMPO}
            />
          </label>
          <label className="block text-sm">
            Formato
            <select value={atual.formato ?? ""} disabled={desabilitado} onChange={(e) => mudar({ formato: (e.target.value || null) as DadosIsca["formato"] }, true)} className={CAMPO}>
              <option value="">Escolha…</option>
              {Object.entries(FORMATOS_ISCA.rotulos).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Como a pessoa recebe
            <select
              value={atual.comoRecebe ?? ""}
              disabled={desabilitado}
              onChange={(e) => mudar({ comoRecebe: (e.target.value || null) as DadosIsca["comoRecebe"] }, true)}
              className={CAMPO}
            >
              <option value="">Escolha…</option>
              {Object.entries(ENTREGAS_ISCA.rotulos).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
            <span className="text-xs text-slate-500">Por enquanto, a entrega é pelo link na bio.</span>
          </label>
          <label className="block text-sm md:col-span-2">
            Link (opcional)
            <input
              value={atual.link ?? ""}
              disabled={desabilitado}
              placeholder="https://"
              onChange={(e) => mudar({ link: e.target.value })}
              onBlur={() => mudar({}, true)}
              className={CAMPO}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={atual.pronta} disabled={desabilitado} onChange={(e) => mudar({ pronta: e.target.checked }, true)} />
            Já está pronta
          </label>
          {!atual.pronta && (
            <label className="block text-sm">
              Fica pronta em
              <input
                type="date"
                value={atual.previsaoPronta ?? ""}
                disabled={desabilitado}
                onChange={(e) => mudar({ previsaoPronta: e.target.value || null }, true)}
                className={CAMPO}
              />
            </label>
          )}
        </div>
      )}

      {isca?.escolha === "SUGESTAO" && (
        <fieldset className="space-y-1">
          <legend className="text-sm">Sem problema. Veja ideias comuns no seu nicho:</legend>
          {sugestoes.map((s) => (
            <label key={s.chave} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="isca-sugestao"
                checked={atual.sugestaoChave === s.chave}
                disabled={desabilitado}
                onChange={() => mudar({ sugestaoChave: s.chave }, true)}
              />
              {s.titulo}
            </label>
          ))}
          <p className="text-xs text-slate-500">A ideia escolhida entra como &quot;ainda não pronta&quot;. Por enquanto, a entrega é pelo link na bio.</p>
        </fieldset>
      )}

      {isca?.escolha === "SEM_ISCA" && (
        <p className="text-sm text-slate-600">Tudo bem. Os posts vão convidar a pessoa a chamar você por mensagem.</p>
      )}
    </div>
  );
}
