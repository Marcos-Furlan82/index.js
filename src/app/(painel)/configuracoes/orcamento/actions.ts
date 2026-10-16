"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirSessao } from "@/auth/sessao";
import type { EstadoFormulario } from "@/componentes/formulario-acao";
import { ID_CONFIGURACAO, obterConfiguracao } from "@/custos/configuracao";
import { recalcularGeracoesSemPreco } from "@/custos/registrar";
import { obterDb } from "@/lib/db";
import { CASAS, Decimal, parseValorBR } from "@/lib/dinheiro";

const CAMINHO = "/configuracoes/orcamento";

function texto(formData: FormData, campo: string): string {
  const v = formData.get(campo);
  return typeof v === "string" ? v : "";
}

async function atualizarConfiguracao(dados: Parameters<ReturnType<typeof obterDb>["configuracao"]["update"]>[0]["data"]) {
  await obterConfiguracao();
  await obterDb().configuracao.update({ where: { id: ID_CONFIGURACAO }, data: dados });
  revalidatePath(CAMINHO);
  revalidatePath("/");
}

export async function salvarTeto(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const r = parseValorBR(texto(formData, "teto"), CASAS.brl);
  if (!r.ok) return { erro: r.erro };
  if (r.valor.lte(0)) return { erro: "O teto precisa ser maior que zero." };
  if (r.valor.gte(new Decimal("10000000000"))) return { erro: "Valor alto demais." };
  await atualizarConfiguracao({ tetoMensalBrl: r.valor });
  return { ok: "Teto mensal salvo." };
}

export async function salvarCotacao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  const sessao = await exigirSessao();
  const r = parseValorBR(texto(formData, "cotacao"), CASAS.cotacao);
  if (!r.ok) return { erro: r.erro };
  if (r.valor.lte(0) || r.valor.gte(1_000_000)) return { erro: "Informe uma cotação válida." };
  await atualizarConfiguracao({
    cotacaoUsdBrl: r.valor,
    cotacaoAtualizadaEm: new Date(),
    cotacaoFonte: "manual",
    cotacaoAtualizadaPor: sessao.usuario.email,
  });
  return { ok: "Cotação salva." };
}

const esquemaAcao = z.enum(["PARAR_GERACAO", "PRIORIZAR_BARATOS"]);

export async function salvarAcaoAoAtingirTeto(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const r = esquemaAcao.safeParse(formData.get("acao"));
  if (!r.success) return { erro: "Escolha uma opção." };
  await atualizarConfiguracao({ acaoAoAtingirTeto: r.data });
  return { ok: "Regra salva." };
}

export async function salvarEmailNotificacao(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const valor = texto(formData, "email").trim();
  if (valor && !z.string().email().max(200).safeParse(valor).success) return { erro: "E-mail inválido." };
  await atualizarConfiguracao({ emailNotificacao: valor ? valor.toLowerCase() : null });
  return { ok: valor ? "E-mail de notificação salvo." : "Notificação por e-mail desativada." };
}

const CAMPOS_PRECO = [
  "usdPorMTokEntrada",
  "usdPorMTokSaida",
  "usdPorMTokCacheLeitura",
  "usdPorMTokCacheEscrita",
  "usdPorImagem",
  "usdPorSegundoVideo",
] as const;

const esquemaIdentificacao = z.object({
  provedor: z.string().trim().min(1, "Informe o provedor.").max(50),
  modelo: z.string().trim().min(1, "Informe o modelo.").max(100),
});

export async function salvarPreco(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const id = esquemaIdentificacao.safeParse({ provedor: formData.get("provedor"), modelo: formData.get("modelo") });
  if (!id.success) return { erro: id.error.issues[0].message };

  const precos: Partial<Record<(typeof CAMPOS_PRECO)[number], Decimal | null>> = {};
  for (const campo of CAMPOS_PRECO) {
    const bruto = texto(formData, campo).trim();
    if (!bruto) {
      precos[campo] = null;
      continue;
    }
    const r = parseValorBR(bruto, CASAS.preco);
    if (!r.ok) return { erro: `${campo}: ${r.erro}` };
    precos[campo] = r.valor;
  }
  if (CAMPOS_PRECO.every((c) => precos[c] === null)) return { erro: "Informe ao menos um preço." };

  const provedor = id.data.provedor.toLowerCase();
  const modelo = id.data.modelo;
  await obterDb().precoModelo.upsert({
    where: { provedor_modelo: { provedor, modelo } },
    update: precos,
    create: { provedor, modelo, ...precos },
  });
  // Gerações que estavam sem preço deste modelo passam a ter custo.
  const recalculo = await recalcularGeracoesSemPreco(provedor, modelo);
  revalidatePath(CAMINHO);
  revalidatePath("/");
  const extra =
    recalculo.geracoes > 0
      ? ` ${recalculo.geracoes} ${recalculo.geracoes === 1 ? "geração sem preço foi recalculada" : "gerações sem preço foram recalculadas"}.`
      : "";
  return { ok: `Preços de ${modelo} salvos.${extra}` };
}

export async function removerPreco(_a: EstadoFormulario, formData: FormData): Promise<EstadoFormulario> {
  await exigirSessao();
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return { erro: "Preço inválido." };
  await obterDb().precoModelo.deleteMany({ where: { id: id.data } });
  revalidatePath(CAMINHO);
  return { ok: "Removido." };
}
