"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ACOES_CTA,
  NIVEIS_CONSCIENCIA,
  ROTULOS_ACAO_CTA,
  ROTULOS_NIVEL,
  type ChaveBloco,
  type Ficha,
} from "@/especialistas/produto/esquema";
import { urlHttp } from "@/lib/url";
import { editarBlocoAcao, marcarRevisadoAcao } from "./actions";

const CAMPO = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm";

function Lista({ itens, vazio = "—" }: { itens: string[]; vazio?: string }) {
  if (itens.length === 0) return <p className="text-sm text-slate-500">{vazio}</p>;
  return (
    <ul className="list-inside list-disc text-sm">
      {itens.map((i, n) => (
        <li key={n}>{i}</li>
      ))}
    </ul>
  );
}

function Rotulado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{rotulo}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

/** Destino do convite: link só se for http(s); senão, texto (nunca href). */
function Destino({ destino }: { destino: string }) {
  const url = urlHttp(destino);
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className="underline">
      {destino}
    </a>
  ) : (
    <span>{destino || "—"}</span>
  );
}

function Visualizacao({ bloco, f, iscaTexto }: { bloco: ChaveBloco; f: Ficha; iscaTexto: string | null }) {
  switch (bloco) {
    case "promessa":
      return <p className="text-base">{f.promessaCentral || "—"}</p>;
    case "oferta":
      return (
        <div className="grid gap-2 md:grid-cols-3">
          <Rotulado rotulo="Preço">{f.oferta.preco || "—"}</Rotulado>
          <Rotulado rotulo="Como compra">{f.oferta.formaCompra || "—"}</Rotulado>
          <Rotulado rotulo="Condições">{f.oferta.condicoes || "—"}</Rotulado>
        </div>
      );
    case "quemCompra":
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Rotulado rotulo="Nome (fictício)">{f.persona.nomeFicticio}</Rotulado>
          <Rotulado rotulo="Momento">{ROTULOS_NIVEL[f.persona.nivelConsciencia]}</Rotulado>
          <div className="md:col-span-2">
            <Rotulado rotulo="Perfil">{f.persona.perfil}</Rotulado>
          </div>
          <Rotulado rotulo="O que incomoda">
            <Lista itens={f.persona.dores} />
          </Rotulado>
          <Rotulado rotulo="O que quer">
            <Lista itens={f.persona.desejos} />
          </Rotulado>
          <Rotulado rotulo="O que faz decidir">
            <Lista itens={f.persona.gatilhosCompra} />
          </Rotulado>
        </div>
      );
    case "diferenciais":
      return (
        <div className="space-y-2">
          <p>{f.diferencial || "—"}</p>
          <Rotulado rotulo="Outros diferenciais">
            <Lista itens={f.diferenciaisSecundarios} />
          </Rotulado>
        </div>
      );
    case "provas":
      return f.provas.length === 0 ? (
        <p className="text-sm text-slate-500">Nenhuma prova autorizada no briefing.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {f.provas.map((p) => (
            <li key={p.id}>
              {p.texto}
              {p.fonte && <span className="text-slate-500"> — {p.fonte}</span>}
            </li>
          ))}
        </ul>
      );
    case "duvidas":
      return (
        <ul className="space-y-2 text-sm">
          {f.objecoes.map((o, i) => (
            <li key={i}>
              <p className="font-medium">&ldquo;{o.objecao}&rdquo;</p>
              <p>{o.resposta}</p>
              {o.provaRef && (
                <p className="text-xs text-slate-500">Prova: {f.provas.find((p) => p.id === o.provaRef)?.texto ?? "—"}</p>
              )}
            </li>
          ))}
          {f.objecoes.length === 0 && <li className="text-slate-500">—</li>}
        </ul>
      );
    case "prometer":
      return (
        <div className="grid gap-3 md:grid-cols-2">
          <Rotulado rotulo="Pode prometer">
            <Lista itens={f.podePrometer} />
          </Rotulado>
          <Rotulado rotulo="Nunca prometer">
            <Lista itens={f.naoPodePrometer} />
          </Rotulado>
        </div>
      );
    case "regras":
      return (
        <div className="space-y-2">
          <Rotulado rotulo="Conselho ou órgão">{f.compliance.orgao ?? "Nenhum informado"}</Rotulado>
          <Rotulado rotulo="Regras de divulgação">
            <Lista itens={f.compliance.regras} />
          </Rotulado>
          <Rotulado rotulo="Palavras que nunca aparecem">
            <Lista itens={f.compliance.termosProibidos} />
          </Rotulado>
        </div>
      );
    case "acao":
      return (
        <div className="grid gap-2 md:grid-cols-3">
          <Rotulado rotulo="Pedir para">{ROTULOS_ACAO_CTA[f.ctaPrincipal.acao]}</Rotulado>
          <Rotulado rotulo="Convite">{f.ctaPrincipal.texto}</Rotulado>
          <Rotulado rotulo="Para onde">
            <Destino destino={f.ctaPrincipal.destino} />
          </Rotulado>
          {iscaTexto && (
            <div className="md:col-span-3">
              <Rotulado rotulo="Isca (material gratuito)">{iscaTexto}</Rotulado>
            </div>
          )}
        </div>
      );
  }
}

const linhas = (t: string) =>
  t
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

function Linhas({ rotulo, valor, aoMudar }: { rotulo: string; valor: string[]; aoMudar: (v: string[]) => void }) {
  const [texto, setTexto] = useState(valor.join("\n"));
  return (
    <label className="block text-sm">
      {rotulo} <span className="text-xs text-slate-500">(um por linha)</span>
      <textarea
        rows={Math.max(3, valor.length + 1)}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          aoMudar(linhas(e.target.value));
        }}
        className={CAMPO}
      />
    </label>
  );
}

function Editor({ bloco, f, aoMudar }: { bloco: ChaveBloco; f: Ficha; aoMudar: (v: Record<string, unknown>) => void }) {
  const [v, setV] = useState<Record<string, unknown>>(() => {
    switch (bloco) {
      case "promessa":
        return { promessaCentral: f.promessaCentral };
      case "oferta":
        return { oferta: f.oferta };
      case "quemCompra":
        return { persona: f.persona };
      case "diferenciais":
        return { diferencial: f.diferencial, diferenciaisSecundarios: f.diferenciaisSecundarios };
      case "duvidas":
        return { objecoes: f.objecoes };
      case "prometer":
        return { podePrometer: f.podePrometer, naoPodePrometer: f.naoPodePrometer };
      case "regras":
        return { compliance: f.compliance };
      case "acao":
        return { ctaPrincipal: f.ctaPrincipal };
      default:
        return {};
    }
  });
  const mudar = (parcial: Record<string, unknown>) => {
    const novo = { ...v, ...parcial };
    setV(novo);
    aoMudar(novo);
  };
  const sub = <K extends string>(chave: K) => v[chave] as Record<string, unknown>;

  switch (bloco) {
    case "promessa":
      return (
        <label className="block text-sm">
          Promessa (até 140 caracteres)
          <textarea rows={2} value={v.promessaCentral as string} onChange={(e) => mudar({ promessaCentral: e.target.value })} className={CAMPO} />
          <span className="text-xs text-slate-500">{(v.promessaCentral as string).length}/140</span>
        </label>
      );
    case "oferta":
      return (
        <div className="grid gap-2 md:grid-cols-3">
          {(["preco", "formaCompra", "condicoes"] as const).map((c) => (
            <label key={c} className="block text-sm">
              {{ preco: "Preço", formaCompra: "Como compra", condicoes: "Condições" }[c]}
              <input value={sub("oferta")[c] as string} onChange={(e) => mudar({ oferta: { ...sub("oferta"), [c]: e.target.value } })} className={CAMPO} />
            </label>
          ))}
        </div>
      );
    case "quemCompra": {
      const p = sub("persona");
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <label className="block text-sm">
            Nome (fictício)
            <input value={p.nomeFicticio as string} onChange={(e) => mudar({ persona: { ...p, nomeFicticio: e.target.value } })} className={CAMPO} />
          </label>
          <label className="block text-sm">
            Momento
            <select value={p.nivelConsciencia as string} onChange={(e) => mudar({ persona: { ...p, nivelConsciencia: e.target.value } })} className={CAMPO}>
              {NIVEIS_CONSCIENCIA.map((n) => (
                <option key={n} value={n}>
                  {ROTULOS_NIVEL[n]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm md:col-span-2">
            Perfil
            <textarea rows={2} value={p.perfil as string} onChange={(e) => mudar({ persona: { ...p, perfil: e.target.value } })} className={CAMPO} />
          </label>
          <Linhas rotulo="O que incomoda" valor={p.dores as string[]} aoMudar={(x) => mudar({ persona: { ...sub("persona"), dores: x } })} />
          <Linhas rotulo="O que quer" valor={p.desejos as string[]} aoMudar={(x) => mudar({ persona: { ...sub("persona"), desejos: x } })} />
          <Linhas rotulo="O que faz decidir" valor={p.gatilhosCompra as string[]} aoMudar={(x) => mudar({ persona: { ...sub("persona"), gatilhosCompra: x } })} />
        </div>
      );
    }
    case "diferenciais":
      return (
        <div className="space-y-2">
          <label className="block text-sm">
            Diferencial (até 140 caracteres)
            <input value={v.diferencial as string} onChange={(e) => mudar({ diferencial: e.target.value })} className={CAMPO} />
          </label>
          <Linhas rotulo="Outros diferenciais" valor={v.diferenciaisSecundarios as string[]} aoMudar={(x) => mudar({ diferenciaisSecundarios: x })} />
        </div>
      );
    case "duvidas": {
      const lista = v.objecoes as Ficha["objecoes"];
      return (
        <div className="space-y-3">
          {lista.map((o, i) => (
            <div key={i} className="space-y-1 rounded border border-slate-200 p-2">
              <label className="block text-sm">
                Dúvida
                <input
                  value={o.objecao}
                  onChange={(e) => mudar({ objecoes: lista.map((x, j) => (j === i ? { ...x, objecao: e.target.value } : x)) })}
                  className={CAMPO}
                />
              </label>
              <label className="block text-sm">
                Resposta
                <textarea
                  rows={2}
                  value={o.resposta}
                  onChange={(e) => mudar({ objecoes: lista.map((x, j) => (j === i ? { ...x, resposta: e.target.value } : x)) })}
                  className={CAMPO}
                />
              </label>
              <label className="block text-sm">
                Prova usada
                <select
                  value={o.provaRef ?? ""}
                  onChange={(e) => mudar({ objecoes: lista.map((x, j) => (j === i ? { ...x, provaRef: e.target.value || null } : x)) })}
                  className={CAMPO}
                >
                  <option value="">Nenhuma</option>
                  {f.provas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.texto.slice(0, 60)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => mudar({ objecoes: lista.filter((_, j) => j !== i) })} className="text-sm text-red-700 underline">
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => mudar({ objecoes: [...lista, { objecao: "", resposta: "", provaRef: null }] })}
            className="rounded border border-slate-300 px-3 py-1 text-sm"
          >
            Adicionar dúvida
          </button>
        </div>
      );
    }
    case "prometer":
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Linhas rotulo="Pode prometer" valor={v.podePrometer as string[]} aoMudar={(x) => mudar({ podePrometer: x })} />
          <Linhas rotulo="Nunca prometer" valor={v.naoPodePrometer as string[]} aoMudar={(x) => mudar({ naoPodePrometer: x })} />
        </div>
      );
    case "regras": {
      const c = sub("compliance");
      return (
        <div className="space-y-2">
          <label className="block text-sm">
            Conselho ou órgão (deixe vazio se não houver)
            <input value={(c.orgao as string | null) ?? ""} onChange={(e) => mudar({ compliance: { ...c, orgao: e.target.value || null } })} className={CAMPO} />
          </label>
          <Linhas rotulo="Regras de divulgação" valor={c.regras as string[]} aoMudar={(x) => mudar({ compliance: { ...sub("compliance"), regras: x } })} />
          <Linhas rotulo="Palavras que nunca aparecem" valor={c.termosProibidos as string[]} aoMudar={(x) => mudar({ compliance: { ...sub("compliance"), termosProibidos: x } })} />
        </div>
      );
    }
    case "acao": {
      const c = sub("ctaPrincipal");
      return (
        <div className="grid gap-2 md:grid-cols-3">
          <label className="block text-sm">
            Pedir para
            <select value={c.acao as string} onChange={(e) => mudar({ ctaPrincipal: { ...c, acao: e.target.value } })} className={CAMPO}>
              {ACOES_CTA.map((a) => (
                <option key={a} value={a}>
                  {ROTULOS_ACAO_CTA[a]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Convite
            <input value={c.texto as string} onChange={(e) => mudar({ ctaPrincipal: { ...c, texto: e.target.value } })} className={CAMPO} />
          </label>
          <label className="block text-sm">
            Para onde
            <input value={c.destino as string} onChange={(e) => mudar({ ctaPrincipal: { ...c, destino: e.target.value } })} className={CAMPO} />
          </label>
        </div>
      );
    }
    default:
      return null;
  }
}

export function BlocoFicha(props: {
  contaId: string;
  produtoId: string;
  fichaId: string;
  bloco: ChaveBloco;
  titulo: string;
  ficha: Ficha;
  iscaTexto: string | null;
  inferido: boolean;
  revisado: boolean;
  podeRevisar: boolean;
  podeEditar: boolean;
  linkBriefing: string;
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState<Record<string, unknown> | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [revisado, setRevisado] = useState(props.revisado);

  function salvar() {
    if (!valor) return setEditando(false);
    iniciar(async () => {
      const r = await editarBlocoAcao({ contaId: props.contaId, produtoId: props.produtoId, fichaId: props.fichaId, bloco: props.bloco, valor });
      if (!r.ok) return setErro(r.erro);
      setErro(null);
      setEditando(false);
      router.push(`/contas/${props.contaId}/produtos/${props.produtoId}/ficha?versao=${r.versao}`);
    });
  }

  function alternarRevisado(v: boolean) {
    setRevisado(v);
    iniciar(async () => {
      const r = await marcarRevisadoAcao({ contaId: props.contaId, produtoId: props.produtoId, fichaId: props.fichaId, bloco: props.bloco, revisado: v });
      if (!r.ok) {
        setRevisado(!v);
        setErro(r.erro);
      } else router.refresh();
    });
  }

  return (
    <section id={`bloco-${props.bloco}`} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-medium">{props.titulo}</h2>
        {props.inferido && (
          <span className="rounded bg-amber-100 px-2 text-xs text-amber-800">tem partes deduzidas pela IA — confira</span>
        )}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {props.podeRevisar && (
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={revisado} disabled={pendente} onChange={(e) => alternarRevisado(e.target.checked)} />
              Revisei este bloco
            </label>
          )}
          {props.podeEditar && !editando && props.bloco !== "provas" && (
            <button type="button" onClick={() => setEditando(true)} className="underline">
              Editar
            </button>
          )}
        </div>
      </div>
      {editando ? (
        <div className="space-y-3">
          <Editor bloco={props.bloco} f={props.ficha} aoMudar={setValor} />
          <p className="text-xs text-slate-500">Salvar cria uma nova versão da ficha. A versão atual continua guardada.</p>
          <div className="flex gap-3">
            <button type="button" disabled={pendente} onClick={salvar} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-60">
              {pendente ? "Salvando..." : "Salvar alteração"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="rounded border border-slate-300 px-3 py-2 text-sm">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <Visualizacao bloco={props.bloco} f={props.ficha} iscaTexto={props.iscaTexto} />
      )}
      {props.bloco === "provas" && props.podeEditar && (
        <p className="text-xs text-slate-500">
          As provas vêm das suas respostas.{" "}
          <a href={props.linkBriefing} className="underline">
            Mudar nas respostas
          </a>{" "}
          e gerar outra versão.
        </p>
      )}
      {erro && (
        <p role="alert" className="text-sm text-red-700">
          {erro}
        </p>
      )}
    </section>
  );
}
