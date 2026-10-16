import type { ResumoMes } from "@/custos/orcamento";
import { formatarBRL, formatarDecimalBR } from "@/lib/dinheiro";

const ROTULO_TIPO = { TEXTO: "Texto", IMAGEM: "Imagem", VIDEO: "Vídeo" } as const;

/** Gasto do mês com IA: barra do teto, avisos e (opcionalmente) detalhes. */
export function PainelGasto({ resumo, detalhado = false }: { resumo: ResumoMes; detalhado?: boolean }) {
  const pct = Math.min(100, Number(resumo.percentual.toFixed(2)));
  const corBarra = pct >= 100 ? "bg-red-600" : pct >= 80 ? "bg-amber-500" : "bg-emerald-600";
  const [ano, mes] = resumo.mes.split("-");
  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-medium">
        Gasto com IA em {mes}/{ano}
      </h2>
      {!resumo.configurado && (
        <p role="alert" className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          Orçamento não configurado: cadastre a cotação do dólar e os preços dos modelos em Configurações → Orçamento.
          Até lá, nenhuma geração com IA é liberada.
        </p>
      )}
      {resumo.geracoesSemPreco > 0 && (
        <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">
          {resumo.geracoesSemPreco} {resumo.geracoesSemPreco === 1 ? "geração sem preço" : "gerações sem preço"} neste
          mês (não entram no total). Cadastre o preço do modelo.
        </p>
      )}
      <p className="text-2xl font-semibold">
        {formatarBRL(resumo.gastoBrl)}{" "}
        <span className="text-base font-normal text-slate-600">
          de {formatarBRL(resumo.tetoBrl)} ({formatarDecimalBR(resumo.percentual, 2)}%)
        </span>
      </p>
      <div className="h-3 w-full rounded bg-slate-100" aria-label={`${formatarDecimalBR(resumo.percentual, 2)}% do teto`}>
        <div className={`h-3 rounded ${corBarra}`} style={{ width: `${pct}%` }} />
      </div>
      {resumo.reservadoBrl.gt(0) && (
        <p className="text-sm text-slate-600">
          Mais {formatarBRL(resumo.reservadoBrl)} separados para gerações em andamento.
        </p>
      )}
      <p className="text-sm text-slate-600">
        Projeção até o fim do mês: {formatarBRL(resumo.projecao.valorBrl)}
        {resumo.projecao.poucoConfiavel && " (pouco confiável nos primeiros dias do mês)"}.
      </p>
      {resumo.alertas.length > 0 && (
        <ul className="text-sm text-red-700">
          {resumo.alertas.map((a) => (
            <li key={a.id}>Alerta: {a.limiar}% do teto atingido.</li>
          ))}
        </ul>
      )}
      {detalhado && (
        <div className="grid gap-4 pt-2 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-medium">Por tipo</h3>
            <ul className="text-sm">
              {(Object.keys(ROTULO_TIPO) as (keyof typeof ROTULO_TIPO)[]).map((t) => (
                <li key={t}>
                  {ROTULO_TIPO[t]}: {formatarBRL(resumo.porTipo[t])}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-medium">Por conta</h3>
            {resumo.porConta.length === 0 ? (
              <p className="text-sm text-slate-500">Sem gastos neste mês.</p>
            ) : (
              <ul className="text-sm">
                {resumo.porConta.map((c) => (
                  <li key={c.contaId ?? "sem-conta"}>
                    {c.nome}: {formatarBRL(c.gastoBrl)}
                    {c.tetoBrl && ` de ${formatarBRL(c.tetoBrl)}`}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
