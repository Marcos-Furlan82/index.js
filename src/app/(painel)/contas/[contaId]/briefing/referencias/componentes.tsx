"use client";

import { useCallback, useState } from "react";
import { IndicadorSalvamento } from "@/componentes/indicador-salvamento";
import { ListaRepetivel } from "@/componentes/lista-repetivel";
import { UploadArquivo } from "@/componentes/upload-arquivo";
import { useAutosave } from "@/componentes/use-autosave";
import { ORIGENS_FONTE, PAPEIS_COR } from "@/briefing/opcoes";
import { salvarRespostasAcao } from "../actions";
import { confirmarUploadReferenciaAcao, salvarMetadadosAcao, solicitarUploadReferenciaAcao } from "./actions";

const CAMPO = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50";

export function UploadReferencia({
  contaId,
  categoria,
  rotulo,
  aceitar,
  multiplos,
  exigeLicenca,
  desabilitado,
}: {
  contaId: string;
  categoria: string;
  rotulo: string;
  aceitar: string;
  multiplos?: boolean;
  exigeLicenca?: boolean;
  desabilitado?: boolean;
}) {
  const [licenca, setLicenca] = useState(false);
  return (
    <div className="space-y-2">
      {exigeLicenca && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={licenca} onChange={(e) => setLicenca(e.target.checked)} disabled={desabilitado} />
          Tenho licença para usar esta fonte no digital e nas redes sociais.
        </label>
      )}
      <UploadArquivo
        rotulo={rotulo}
        aceitar={aceitar}
        multiplos={multiplos}
        desabilitado={desabilitado || (exigeLicenca && !licenca)}
        solicitar={(d) => solicitarUploadReferenciaAcao({ ...d, contaId, categoria, licencaFonte: licenca })}
        confirmar={(midiaId) => confirmarUploadReferenciaAcao(contaId, midiaId)}
      />
    </div>
  );
}

type Metadados = {
  origem: "PROPRIA" | "TERCEIROS" | null;
  gosta: string[];
  gostaLivre: string | null;
  naoGosta: string | null;
  formato: "POST" | "CARROSSEL" | "STORIES" | "CAPA_REELS" | null;
  peso: "EXATO" | "SO_A_IDEIA" | null;
  direitoDeclarado: boolean;
};

const GOSTA: Record<string, string> = {
  CORES: "Cores",
  TIPOGRAFIA: "Letras",
  LAYOUT: "Organização",
  FOTO: "Foto",
  QUANTIDADE_TEXTO: "Quantidade de texto",
  CLIMA: "Clima",
};

const FORMATOS: Record<string, string> = { POST: "Post", CARROSSEL: "Carrossel", STORIES: "Stories", CAPA_REELS: "Capa de reels" };

/** Metadados de uma arte, salvos a cada mudança. */
export function MetadadosArte({
  contaId,
  referenciaId,
  inicial,
  desabilitado,
}: {
  contaId: string;
  referenciaId: string;
  inicial: Metadados;
  desabilitado: boolean;
}) {
  const [m, setM] = useState<Metadados>(inicial);
  const salvar = useCallback(
    (mudancas: Record<string, unknown>) => salvarMetadadosAcao(contaId, referenciaId, mudancas.dados),
    [contaId, referenciaId],
  );
  const autosave = useAutosave(salvar);
  function mudar(parcial: Partial<Metadados>, imediato = true) {
    const novo = { ...m, ...parcial };
    setM(novo);
    // Arte própria só salva depois de declarar o direito de uso (evita erro no meio do preenchimento).
    autosave.registrar("dados", novo, imediato);
  }
  const nome = `arte-${referenciaId}`;
  return (
    <div className="space-y-2 text-sm">
      <fieldset>
        <legend className="font-medium">De onde é esta arte?</legend>
        <label className="mr-4 inline-flex items-center gap-1">
          <input type="radio" name={`${nome}-origem`} checked={m.origem === "PROPRIA"} disabled={desabilitado} onChange={() => mudar({ origem: "PROPRIA" })} />
          Da minha marca
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="radio"
            name={`${nome}-origem`}
            checked={m.origem === "TERCEIROS"}
            disabled={desabilitado}
            onChange={() => mudar({ origem: "TERCEIROS", direitoDeclarado: false })}
          />
          Inspiração de outra marca
        </label>
      </fieldset>
      {m.origem === "PROPRIA" && (
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={m.direitoDeclarado} disabled={desabilitado} onChange={(e) => mudar({ direitoDeclarado: e.target.checked })} />
          Tenho direito de usar esta imagem.
        </label>
      )}
      {m.origem === "TERCEIROS" && (
        <p className="text-xs text-slate-500">Usada só para entender o estilo. Nunca é publicada nem usada como base.</p>
      )}
      <fieldset>
        <legend className="font-medium">O que você gosta nela?</legend>
        <div className="flex flex-wrap gap-x-4">
          {Object.entries(GOSTA).map(([v, r]) => (
            <label key={v} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={m.gosta.includes(v)}
                disabled={desabilitado}
                onChange={(e) => mudar({ gosta: e.target.checked ? [...m.gosta, v] : m.gosta.filter((x) => x !== v) })}
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        Mais alguma coisa que você gosta (opcional)
        <input
          value={m.gostaLivre ?? ""}
          maxLength={200}
          disabled={desabilitado}
          onChange={(e) => mudar({ gostaLivre: e.target.value }, false)}
          onBlur={() => void autosave.salvarAgora()}
          className={CAMPO}
        />
      </label>
      <label className="block">
        O que você não gosta (opcional)
        <input
          value={m.naoGosta ?? ""}
          maxLength={200}
          disabled={desabilitado}
          onChange={(e) => mudar({ naoGosta: e.target.value }, false)}
          onBlur={() => void autosave.salvarAgora()}
          className={CAMPO}
        />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="block">
          Formato
          <select
            value={m.formato ?? ""}
            disabled={desabilitado}
            onChange={(e) => mudar({ formato: (e.target.value || null) as Metadados["formato"] })}
            className={CAMPO}
          >
            <option value="">Escolha…</option>
            {Object.entries(FORMATOS).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Quanto seguir</legend>
          <label className="mr-3 inline-flex items-center gap-1">
            <input type="radio" name={`${nome}-peso`} checked={m.peso === "EXATO"} disabled={desabilitado} onChange={() => mudar({ peso: "EXATO" })} />
            Exatamente isso
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" name={`${nome}-peso`} checked={m.peso === "SO_A_IDEIA"} disabled={desabilitado} onChange={() => mudar({ peso: "SO_A_IDEIA" })} />
            Só a ideia
          </label>
        </fieldset>
      </div>
      <IndicadorSalvamento estado={autosave.estado} />
    </div>
  );
}

/** Declaração de direito sobre o logo. */
export function DireitoLogo({ contaId, referenciaId, inicial, desabilitado }: { contaId: string; referenciaId: string; inicial: boolean; desabilitado: boolean }) {
  const [v, setV] = useState(inicial);
  const salvar = useCallback(
    (mudancas: Record<string, unknown>) => salvarMetadadosAcao(contaId, referenciaId, { direitoDeclarado: mudancas.direito }),
    [contaId, referenciaId],
  );
  const autosave = useAutosave(salvar);
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={v}
        disabled={desabilitado}
        onChange={(e) => {
          setV(e.target.checked);
          autosave.registrar("direito", e.target.checked, true);
        }}
      />
      Este logo é da minha marca e posso usá-lo.
    </label>
  );
}

type Cor = { hex: string; papel: keyof typeof PAPEIS_COR.rotulos };
type Fonte = { id: string; familia: string; origem: keyof typeof ORIGENS_FONTE.rotulos };

/** Cores, fontes e links de inspiração (opcionais), com autosave no briefing da conta. */
export function IdentidadeVisual({
  contaId,
  inicial,
  desabilitado,
}: {
  contaId: string;
  inicial: { cores: Cor[]; fontes: Fonte[]; links: string[] };
  desabilitado: boolean;
}) {
  const [cores, setCores] = useState<(Cor & { id: string })[]>(() => inicial.cores.map((c) => ({ ...c, id: crypto.randomUUID() })));
  const [fontes, setFontes] = useState<Fonte[]>(inicial.fontes);
  const [links, setLinks] = useState<string[]>(inicial.links.length > 0 ? inicial.links : [""]);
  const salvar = useCallback(
    (mudancas: Record<string, unknown>) => salvarRespostasAcao({ contaId, etapa: 5, mudancas }),
    [contaId],
  );
  const autosave = useAutosave(salvar);
  const HEX = /^#[0-9a-fA-F]{6}$/;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium">Cores da marca (opcional, até 6)</h3>
        <ListaRepetivel
          itens={cores}
          maximo={6}
          desabilitado={desabilitado}
          rotuloAdicionar="Adicionar cor"
          novoItem={() => ({ id: crypto.randomUUID(), hex: "#000000", papel: "PRINCIPAL" as const })}
          aoMudar={(itens, imediato) => {
            setCores(itens);
            const validas = itens.filter((c) => HEX.test(c.hex)).map(({ hex, papel }) => ({ hex, papel }));
            autosave.registrar("marca.cores", validas, imediato);
          }}
          renderItem={(c, atualizar) => (
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="block">
                Cor
                <input type="color" value={HEX.test(c.hex) ? c.hex : "#000000"} disabled={desabilitado} onChange={(e) => atualizar({ hex: e.target.value })} className="mt-1 block h-9 w-14" />
              </label>
              <label className="block">
                Código
                <input
                  value={c.hex}
                  maxLength={7}
                  disabled={desabilitado}
                  onChange={(e) => atualizar({ hex: e.target.value })}
                  onBlur={() => void autosave.salvarAgora()}
                  className={`${CAMPO} w-28`}
                />
                {!HEX.test(c.hex) && <span className="block text-xs text-red-700">Use o formato #RRGGBB.</span>}
              </label>
              <label className="block">
                Papel
                <select value={c.papel} disabled={desabilitado} onChange={(e) => atualizar({ papel: e.target.value as Cor["papel"] }, true)} className={CAMPO}>
                  {Object.entries(PAPEIS_COR.rotulos).map(([v, r]) => (
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

      <div className="space-y-2">
        <h3 className="font-medium">Fontes (opcional)</h3>
        <ListaRepetivel
          itens={fontes}
          maximo={5}
          desabilitado={desabilitado}
          rotuloAdicionar="Adicionar fonte"
          novoItem={() => ({ id: crypto.randomUUID(), familia: "", origem: "NAO_SEI" as const })}
          aoMudar={(itens, imediato) => {
            setFontes(itens);
            autosave.registrar("marca.fontes", itens.filter((f) => f.familia.trim()), imediato);
          }}
          renderItem={(f, atualizar) => (
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="block">
                Nome da fonte
                <input
                  value={f.familia}
                  maxLength={100}
                  placeholder="Montserrat"
                  disabled={desabilitado}
                  onChange={(e) => atualizar({ familia: e.target.value })}
                  onBlur={() => void autosave.salvarAgora()}
                  className={CAMPO}
                />
              </label>
              <label className="block">
                De onde vem
                <select value={f.origem} disabled={desabilitado} onChange={(e) => atualizar({ origem: e.target.value as Fonte["origem"] }, true)} className={CAMPO}>
                  {Object.entries(ORIGENS_FONTE.rotulos).map(([v, r]) => (
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

      <div className="space-y-2">
        <h3 className="font-medium">Perfis que você admira (opcional, até 3 links)</h3>
        <p className="text-xs text-slate-500">Guardamos só o link, sem entrar no perfil.</p>
        {links.map((l, i) => (
          <input
            key={i}
            value={l}
            placeholder="https://instagram.com/perfil"
            disabled={desabilitado}
            onChange={(e) => setLinks(links.map((x, j) => (j === i ? e.target.value : x)))}
            onBlur={() => autosave.registrar("marca.links", links.map((x) => x.trim()).filter(Boolean), true)}
            className={CAMPO}
          />
        ))}
        {!desabilitado && links.length < 3 && (
          <button type="button" onClick={() => setLinks([...links, ""])} className="rounded border border-slate-300 px-3 py-1 text-sm">
            Adicionar link
          </button>
        )}
      </div>
      <IndicadorSalvamento estado={autosave.estado} />
    </div>
  );
}
