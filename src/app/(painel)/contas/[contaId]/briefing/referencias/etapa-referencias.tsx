import Link from "next/link";
import {
  ACEITAR_INPUT,
  avisosReferencias,
  bloqueiosReferencias,
  listarReferencias,
  MAX_ARTES,
  urlLeituraPrivada,
  type ReferenciaComMidia,
} from "@/armazenamento/referencias";
import { lerBriefingMarca } from "@/briefing/esquemas";
import type { Faltante } from "@/briefing/obrigatorios";
import { FormularioAcao } from "@/componentes/formulario-acao";
import { ListaFaltantes } from "@/componentes/lista-faltantes";
import { obterDb } from "@/lib/db";
import { concluirReferenciasAcao, removerReferenciaAcao } from "./actions";
import { DireitoLogo, IdentidadeVisual, MetadadosArte, UploadReferencia } from "./componentes";

const CARTAO = "space-y-4 rounded-lg border border-slate-200 bg-white p-4";

const ROTULO_CATEGORIA: Record<string, string> = {
  LOGO: "Logo principal",
  LOGO_NEGATIVO: "Logo para fundo escuro",
  SIMBOLO: "Símbolo",
  LOGO_ARQUIVO_FONTE: "Arquivo original do logo",
  FONTE: "Arquivo de fonte",
  ARTE: "Arte",
  PROVA: "Arquivo de prova",
};

async function comUrls(refs: ReferenciaComMidia[]) {
  return Promise.all(
    refs.map(async (r) => ({
      ...r,
      miniatura: r.midia.miniaturaChave ? await urlLeituraPrivada(r.midia.miniaturaChave) : null,
      original: await urlLeituraPrivada(r.midia.chave, {
        nomeDownload: r.midia.nomeOriginal,
        tipoMime: r.midia.tipoMime,
      }),
    })),
  );
}

type RefComUrl = Awaited<ReturnType<typeof comUrls>>[number];

function Miniatura({ r }: { r: RefComUrl }) {
  return r.miniatura ? (
    // eslint-disable-next-line @next/next/no-img-element -- URL assinada curta; o otimizador do Next não serve aqui
    <img src={r.miniatura} alt={r.midia.nomeOriginal} className="h-32 w-32 rounded border border-slate-200 bg-[repeating-conic-gradient(#e2e8f0_0_25%,#fff_0_50%)] bg-[length:16px_16px] object-contain" />
  ) : (
    <div className="flex h-32 w-32 items-center justify-center rounded border border-slate-200 text-center text-xs text-slate-500">
      {r.midia.nomeOriginal}
    </div>
  );
}

function Remover({ contaId, referenciaId, desabilitado }: { contaId: string; referenciaId: string; desabilitado: boolean }) {
  if (desabilitado) return null;
  return (
    <FormularioAcao acao={removerReferenciaAcao} rotuloBotao="Remover" estiloBotao="link">
      <input type="hidden" name="contaId" value={contaId} />
      <input type="hidden" name="referenciaId" value={referenciaId} />
    </FormularioAcao>
  );
}

function Avisos({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="text-xs text-amber-700">
      {avisos.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  );
}

/** Etapa 5: referências visuais (logo, artes, cores, fontes e links). Não bloqueia a ficha. */
export async function EtapaReferencias({
  contaId,
  produtoId,
  somenteLeitura,
  faltando,
}: {
  contaId: string;
  produtoId: string;
  somenteLeitura: boolean;
  faltando: Faltante[];
}) {
  const [refs, marca, ultimoConjunto] = await Promise.all([
    listarReferencias(contaId),
    obterDb().marca.findUnique({ where: { contaId } }),
    obterDb().conjuntoReferencias.findFirst({ where: { contaId }, orderBy: { versao: "desc" } }),
  ]);
  const itens = await comUrls(refs);
  const briefing = lerBriefingMarca(marca?.briefing);
  const logos = itens.filter((r) => ["LOGO", "LOGO_NEGATIVO", "SIMBOLO", "LOGO_ARQUIVO_FONTE"].includes(r.categoria));
  const artes = itens.filter((r) => r.categoria === "ARTE");
  const fontes = itens.filter((r) => r.categoria === "FONTE");
  const bloqueios = bloqueiosReferencias(refs);
  const avisos = avisosReferencias(refs);
  const faltamArtes = Math.max(0, 3 - artes.length);

  return (
    <div className="space-y-6">
      <section className={CARTAO}>
        <h2 className="text-lg font-medium">Mostre como você quer que a página fique.</h2>
        <p className="text-sm text-slate-600">Com essas imagens, o sistema entende cores, letras e estilo da sua marca.</p>
        <p className="text-sm font-medium text-slate-700">Use só imagens que você tem direito de usar.</p>
        <p className="text-xs text-slate-500">
          Tudo fica guardado em área privada. Artes de outras marcas servem só para entender o estilo: nunca são
          publicadas nem usadas como base. Você pode gerar a ficha do produto antes de terminar esta etapa.
        </p>
      </section>

      <section className={CARTAO} id="campo-logo">
        <h2 className="text-lg font-medium">Logo</h2>
        <p className="text-sm text-slate-600">
          Obrigatório: o logo principal, de preferência em SVG ou PNG com fundo transparente e pelo menos 1000 px. Se
          tiver, envie também a versão para fundo escuro e o símbolo. Arquivos PDF, AI ou EPS ficam guardados como
          arquivo original.
        </p>
        <div className="flex flex-wrap gap-4">
          {logos.map((r) => (
            <div key={r.id} className="w-56 space-y-1">
              <Miniatura r={r} />
              <p className="text-sm font-medium">{ROTULO_CATEGORIA[r.categoria]}</p>
              {r.midia.tipoMime === "image/svg+xml" && (
                <a href={r.original} className="text-xs underline" rel="noopener noreferrer">
                  Baixar o SVG original
                </a>
              )}
              <Avisos avisos={r.avisos} />
              <DireitoLogo contaId={contaId} referenciaId={r.id} inicial={r.direitoDeclarado} desabilitado={somenteLeitura} />
              <Remover contaId={contaId} referenciaId={r.id} desabilitado={somenteLeitura} />
            </div>
          ))}
        </div>
        {!somenteLeitura && (
          <div className="flex flex-wrap gap-4">
            <UploadReferencia contaId={contaId} categoria="LOGO" rotulo="Enviar logo principal" aceitar={ACEITAR_INPUT.LOGO} />
            <UploadReferencia contaId={contaId} categoria="LOGO_NEGATIVO" rotulo="Enviar logo para fundo escuro" aceitar={ACEITAR_INPUT.LOGO_NEGATIVO} />
            <UploadReferencia contaId={contaId} categoria="SIMBOLO" rotulo="Enviar símbolo" aceitar={ACEITAR_INPUT.SIMBOLO} />
          </div>
        )}
      </section>

      <section className={CARTAO} id="campo-artes">
        <h2 className="text-lg font-medium">
          Artes que você gosta ({artes.length} de 3 a {MAX_ARTES})
        </h2>
        <p className="text-sm text-slate-600">
          JPG, PNG ou WebP com pelo menos 1080 px de largura. Uma arte por arquivo (evite print do feed inteiro). Vídeo
          não: envie um print da capa. Se puder, inclua pelo menos uma vertical (stories) e uma de feed.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {artes.map((r) => (
            <div key={r.id} className="flex gap-3 rounded border border-slate-200 p-3">
              <div className="space-y-1">
                <Miniatura r={r} />
                <p className="text-xs text-slate-500">
                  {r.midia.largura}×{r.midia.altura} px
                </p>
                <Remover contaId={contaId} referenciaId={r.id} desabilitado={somenteLeitura} />
              </div>
              <MetadadosArte
                contaId={contaId}
                referenciaId={r.id}
                desabilitado={somenteLeitura}
                inicial={{
                  origem: r.origem,
                  gosta: r.gosta,
                  gostaLivre: r.gostaLivre,
                  naoGosta: r.naoGosta,
                  formato: r.formato,
                  peso: r.peso,
                  direitoDeclarado: r.direitoDeclarado,
                }}
              />
            </div>
          ))}
        </div>
        {!somenteLeitura && artes.length < MAX_ARTES && (
          <UploadReferencia contaId={contaId} categoria="ARTE" rotulo="Enviar artes" aceitar={ACEITAR_INPUT.ARTE} multiplos />
        )}
      </section>

      <section className={CARTAO}>
        <h2 className="text-lg font-medium">Cores, fontes e inspirações</h2>
        <IdentidadeVisual
          contaId={contaId}
          desabilitado={somenteLeitura}
          inicial={{ cores: briefing.cores ?? [], fontes: briefing.fontes ?? [], links: briefing.links ?? [] }}
        />
        <div className="space-y-2">
          <h3 className="font-medium">Arquivo da fonte (opcional)</h3>
          <ul className="text-sm">
            {fontes.map((f) => (
              <li key={f.id} className="flex items-center gap-3">
                {f.midia.nomeOriginal}
                <Remover contaId={contaId} referenciaId={f.id} desabilitado={somenteLeitura} />
              </li>
            ))}
          </ul>
          {!somenteLeitura && (
            <UploadReferencia contaId={contaId} categoria="FONTE" rotulo="Enviar arquivo .ttf, .otf ou .woff2" aceitar={ACEITAR_INPUT.FONTE} exigeLicenca />
          )}
        </div>
      </section>

      <section className={CARTAO}>
        {ultimoConjunto && (
          <p className="text-sm text-emerald-700">
            Referências concluídas (versão {ultimoConjunto.versao}). Se mudar algo, conclua de novo para guardar uma nova versão.
          </p>
        )}
        <Avisos avisos={avisos} />
        {!somenteLeitura &&
          (bloqueios.length > 0 ? (
            <div className="space-y-1">
              <button type="button" disabled className="rounded bg-slate-300 px-3 py-2 text-sm text-slate-700">
                {faltamArtes > 0 ? `Envie mais ${faltamArtes} ${faltamArtes === 1 ? "arte" : "artes"} para continuar` : "Concluir referências"}
              </button>
              <ul className="text-sm text-slate-600">
                {bloqueios.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </div>
          ) : (
            <FormularioAcao acao={concluirReferenciasAcao} rotuloBotao="Concluir referências">
              <input type="hidden" name="contaId" value={contaId} />
            </FormularioAcao>
          ))}
        <ListaFaltantes faltando={faltando} />
        <div className="flex gap-3 text-sm">
          <Link href={`/contas/${contaId}/briefing?etapa=4`} className="rounded border border-slate-300 px-3 py-2">
            Voltar
          </Link>
          <Link href={`/contas/${contaId}/produtos/${produtoId}/ficha`} className="rounded bg-slate-900 px-3 py-2 text-white">
            Revisar a ficha do produto
          </Link>
        </div>
      </section>
    </div>
  );
}
