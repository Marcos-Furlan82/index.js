import { FormularioAcao } from "@/componentes/formulario-acao";
import { obterConfiguracao } from "@/custos/configuracao";
import { resumoDoMes } from "@/custos/orcamento";
import { formatarDataHora } from "@/lib/datas";
import { obterDb } from "@/lib/db";
import { formatarBRL, formatarDecimalBR, formatarPreco } from "@/lib/dinheiro";
import { PainelGasto } from "../../painel-gasto";
import {
  removerPreco,
  salvarAcaoAoAtingirTeto,
  salvarCotacao,
  salvarEmailNotificacao,
  salvarPreco,
  salvarTeto,
  salvarTetoConta,
} from "./actions";

export const dynamic = "force-dynamic";

const CAMPO = "mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm";
const CARTAO = "space-y-3 rounded-lg border border-slate-200 bg-white p-4";

const COLUNAS_PRECO = [
  { campo: "usdPorMTokEntrada", rotulo: "Entrada (US$/1M tokens)" },
  { campo: "usdPorMTokSaida", rotulo: "Saída (US$/1M tokens)" },
  { campo: "usdPorMTokCacheLeitura", rotulo: "Cache leitura (US$/1M)" },
  { campo: "usdPorMTokCacheEscrita", rotulo: "Cache escrita (US$/1M)" },
  { campo: "usdPorImagem", rotulo: "US$ por imagem" },
  { campo: "usdPorSegundoVideo", rotulo: "US$ por segundo de vídeo" },
] as const;

export default async function PaginaOrcamento() {
  const db = obterDb();
  const [config, resumo, precos] = await Promise.all([
    obterConfiguracao(db),
    resumoDoMes(db),
    db.precoModelo.findMany({ orderBy: [{ provedor: "asc" }, { modelo: "asc" }] }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Orçamento</h1>

      <PainelGasto resumo={resumo} detalhado />

      <div className="grid gap-6 md:grid-cols-2">
        <section className={CARTAO}>
          <h2 className="text-lg font-medium">Teto mensal</h2>
          <p className="text-sm text-slate-600">
            Limite de gasto com IA por mês, em reais. Custos fixos de infraestrutura não entram aqui.
          </p>
          <FormularioAcao acao={salvarTeto} rotuloBotao="Salvar teto">
            <label className="block text-sm">
              Valor (R$)
              <input name="teto" defaultValue={formatarDecimalBR(config.tetoMensalBrl, 2)} inputMode="decimal" className={CAMPO} />
            </label>
          </FormularioAcao>
        </section>

        <section className={CARTAO}>
          <h2 className="text-lg font-medium">Cotação do dólar</h2>
          <p className="text-sm text-slate-600">
            {config.cotacaoUsdBrl
              ? `Atual: R$ ${formatarDecimalBR(config.cotacaoUsdBrl, 4)}, informada ${
                  config.cotacaoAtualizadaEm ? `em ${formatarDataHora(config.cotacaoAtualizadaEm)}` : ""
                }${config.cotacaoAtualizadaPor ? ` por ${config.cotacaoAtualizadaPor}` : ""}.`
              : "Nenhuma cotação cadastrada. Sem ela, nenhuma geração com IA é liberada."}
          </p>
          {resumo.cotacaoDesatualizada && config.cotacaoUsdBrl && (
            <p className="text-sm text-amber-700">A cotação tem mais de 30 dias. Atualize.</p>
          )}
          <FormularioAcao acao={salvarCotacao} rotuloBotao="Salvar cotação">
            <label className="block text-sm">
              R$ por US$ 1 (até 4 casas, ex.: 5,4321)
              <input
                name="cotacao"
                defaultValue={config.cotacaoUsdBrl ? formatarDecimalBR(config.cotacaoUsdBrl, 4) : ""}
                inputMode="decimal"
                className={CAMPO}
              />
            </label>
          </FormularioAcao>
        </section>

        <section className={CARTAO}>
          <h2 className="text-lg font-medium">Ao atingir 100% do teto</h2>
          <FormularioAcao acao={salvarAcaoAoAtingirTeto} rotuloBotao="Salvar regra">
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="acao" value="PARAR_GERACAO" defaultChecked={config.acaoAoAtingirTeto === "PARAR_GERACAO"} />
              <span>Parar de gerar conteúdo novo com IA (as publicações aprovadas continuam).</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="radio" name="acao" value="PRIORIZAR_BARATOS" defaultChecked={config.acaoAoAtingirTeto === "PRIORIZAR_BARATOS"} />
              <span>Priorizar formatos baratos (por exemplo, carrossel animado em vez de vídeo de IA).</span>
            </label>
          </FormularioAcao>
        </section>

        <section className={CARTAO}>
          <h2 className="text-lg font-medium">E-mail de notificação</h2>
          <p className="text-sm text-slate-600">Recebe os alertas de 50%, 80% e 100%. Deixe vazio para só ver no painel.</p>
          <FormularioAcao acao={salvarEmailNotificacao} rotuloBotao="Salvar e-mail">
            <label className="block text-sm">
              E-mail
              <input name="email" type="email" defaultValue={config.emailNotificacao ?? ""} className={CAMPO} />
            </label>
          </FormularioAcao>
        </section>
      </div>

      <section className={CARTAO}>
        <h2 className="text-lg font-medium">Divisão por conta</h2>
        <p className="text-sm text-slate-600">
          Opcional: uma cota mensal para cada conta, dentro do teto geral. Sem cota, a conta usa só o teto geral. Os
          alertas de 50%, 80% e 100% também valem para cada cota.
        </p>
        {resumo.somaCotasBrl.gt(resumo.tetoBrl) && (
          <p role="alert" className="rounded bg-amber-50 p-2 text-sm text-amber-800">
            A soma das cotas ({formatarBRL(resumo.somaCotasBrl)}) passa do teto geral ({formatarBRL(resumo.tetoBrl)}). O
            teto geral continua valendo: as contas podem não conseguir usar a cota inteira.
          </p>
        )}
        {resumo.divisao.length === 0 ? (
          <p className="text-sm text-slate-500">Nenhuma conta cadastrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Conta</th>
                  <th className="py-2 pr-3">Gasto no mês</th>
                  <th className="py-2 pr-3">Em andamento</th>
                  <th className="py-2 pr-3">Uso da cota</th>
                  <th className="py-2">Cota mensal (R$)</th>
                </tr>
              </thead>
              <tbody>
                {resumo.divisao.map((c) => (
                  <tr key={c.contaId} className="border-t border-slate-100 align-top">
                    <td className="py-2 pr-3">{c.nome}</td>
                    <td className="py-2 pr-3">{formatarBRL(c.gastoBrl)}</td>
                    <td className="py-2 pr-3">{c.reservadoBrl.gt(0) ? formatarBRL(c.reservadoBrl) : "—"}</td>
                    <td className="py-2 pr-3">
                      {c.percentual ? `${formatarDecimalBR(c.percentual, 2)}%` : "sem cota"}
                      {c.percentual && c.percentual.gte(80) && (
                        <span className="ml-1 text-red-700">{c.percentual.gte(100) ? "(cota atingida)" : "(perto do limite)"}</span>
                      )}
                    </td>
                    <td className="py-2">
                      <FormularioAcao acao={salvarTetoConta} rotuloBotao="Salvar" className="flex items-center gap-2">
                        <input type="hidden" name="contaId" value={c.contaId} />
                        <input
                          name="teto"
                          aria-label={`Cota mensal de ${c.nome}`}
                          defaultValue={c.tetoBrl ? formatarDecimalBR(c.tetoBrl, 2) : ""}
                          placeholder="sem cota"
                          inputMode="decimal"
                          className="w-28 rounded border border-slate-300 px-2 py-1 text-sm"
                        />
                      </FormularioAcao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={CARTAO}>
        <h2 className="text-lg font-medium">Tabela de preços dos modelos</h2>
        <p className="text-sm text-slate-600">
          Preços em dólar, conforme a página de preços de cada provedor. Atualize quando eles mudarem. Gerações de
          modelos sem preço ficam marcadas como pendentes.
        </p>
        {precos.length === 0 && <p className="text-sm text-amber-700">Nenhum modelo cadastrado ainda.</p>}
        {precos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Provedor</th>
                  <th className="py-2 pr-3">Modelo</th>
                  {COLUNAS_PRECO.map((c) => (
                    <th key={c.campo} className="py-2 pr-3">
                      {c.rotulo}
                    </th>
                  ))}
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {precos.map((p) => (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="py-2 pr-3">{p.provedor}</td>
                    <td className="py-2 pr-3">{p.modelo}</td>
                    {COLUNAS_PRECO.map((c) => (
                      <td key={c.campo} className="py-2 pr-3">
                        {p[c.campo] ? formatarPreco(p[c.campo]!) : "—"}
                      </td>
                    ))}
                    <td className="py-2">
                      <FormularioAcao acao={removerPreco} rotuloBotao="Remover" estiloBotao="link">
                        <input type="hidden" name="id" value={p.id} />
                      </FormularioAcao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <h3 className="pt-2 font-medium">Adicionar ou atualizar modelo</h3>
        <FormularioAcao acao={salvarPreco} rotuloBotao="Salvar preços">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="block text-sm">
              Provedor
              <input name="provedor" placeholder="anthropic, google..." className={CAMPO} />
            </label>
            <label className="block text-sm">
              Modelo (nome exato usado na API)
              <input name="modelo" className={CAMPO} />
            </label>
            {COLUNAS_PRECO.map((c) => (
              <label key={c.campo} className="block text-sm">
                {c.rotulo}
                <input name={c.campo} inputMode="decimal" placeholder="opcional" className={CAMPO} />
              </label>
            ))}
          </div>
        </FormularioAcao>
      </section>

      <p className="text-xs text-slate-500">
        Teto atual: {formatarBRL(config.tetoMensalBrl)}. Configure também limites de gasto nos painéis da Anthropic e do
        Google, um pouco acima deste teto, como segunda proteção.
      </p>
    </div>
  );
}
