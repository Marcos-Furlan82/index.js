import { beforeEach, describe, expect, it } from "vitest";
import { destinoDoRedirect, requisicaoFalsa } from "./next-falso";
import {
  arquivarContaAcao,
  arquivarProdutoAcao,
  criarContaAcao,
  criarProdutoAcao,
  definirPrincipalAcao,
  editarContaAcao,
  trocarContaAtiva,
} from "@/app/(painel)/contas/actions";
import { COOKIE_CONTA_ATIVA } from "@/contas/conta-ativa";
import { criarConta, listarContas } from "@/contas/contas";
import { obterDb } from "@/lib/db";
import { entrarComoGestor } from "./ajudantes";

const db = () => obterDb();

function form(dados: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(dados)) f.set(k, v);
  return f;
}

async function novaConta(nome = "Doce Ateliê", usuarioInstagram: string | null = "doceatelie") {
  const r = await criarConta({ nome, usuarioInstagram });
  if (!r.ok) throw new Error(r.erro);
  return r.valor;
}

beforeEach(() => requisicaoFalsa.limpar());

describe("contas", () => {
  it("todas as ações exigem sessão", async () => {
    const id = "6f1c2a8e-1111-4222-8333-444455556666";
    const acoes = [
      () => criarContaAcao({}, form({ nome: "X" })),
      () => editarContaAcao({}, form({ contaId: id, nome: "X" })),
      () => arquivarContaAcao({}, form({ contaId: id, confirmo: "sim" })),
      () => trocarContaAtiva(form({ contaId: id })),
      () => criarProdutoAcao({}, form({ contaId: id, nome: "X" })),
      () => definirPrincipalAcao({}, form({ contaId: id, produtoId: id })),
      () => arquivarProdutoAcao({}, form({ contaId: id, produtoId: id })),
    ];
    for (const acao of acoes) expect(await destinoDoRedirect(acao)).toBe("/login");
    expect(await db().contaInstagram.count()).toBe(0);
  });

  it("criar conta cria a marca e o produto principal provisório, define a conta ativa e abre o briefing", async () => {
    await entrarComoGestor();
    const destino = await destinoDoRedirect(() => criarContaAcao({}, form({ nome: " Doce  Ateliê ", usuarioInstagram: "@DoceAtelie" })));
    const conta = await db().contaInstagram.findFirstOrThrow({ include: { marca: true, produtos: true } });
    expect(destino).toBe(`/contas/${conta.id}/briefing?etapa=1`);
    expect(conta).toMatchObject({ nome: "Doce Ateliê", usuarioInstagram: "doceatelie" });
    expect(conta.marca).not.toBeNull();
    expect(conta.produtos).toHaveLength(1);
    expect(conta.produtoPrincipalId).toBe(conta.produtos[0].id);
    expect(requisicaoFalsa.cookies.get(COOKIE_CONTA_ATIVA)).toBe(conta.id);
  });

  it("@ único entre as contas não arquivadas, inclusive em criações simultâneas", async () => {
    const resultados = await Promise.all(Array.from({ length: 5 }, () => criarConta({ nome: "A", usuarioInstagram: "mesmo" })));
    expect(resultados.filter((r) => r.ok)).toHaveLength(1);
    expect(resultados.find((r) => !r.ok)).toMatchObject({ erro: "Já existe uma conta com @mesmo." });
    // Arquivar libera o @.
    await db().contaInstagram.updateMany({ data: { arquivadaEm: new Date() } });
    expect((await criarConta({ nome: "B", usuarioInstagram: "mesmo" })).ok).toBe(true);
    expect((await criarConta({ nome: "C", usuarioInstagram: "com espaço" })).ok).toBe(false);
  });

  it("editar, trocar a conta ativa e arquivar (só leitura depois)", async () => {
    await entrarComoGestor();
    const a = await novaConta("A", "conta.a");
    await novaConta("B", "conta.b");
    expect((await editarContaAcao({}, form({ contaId: a.id, nome: "A2", usuarioInstagram: "conta.b" }))).erro).toContain("@conta.b");
    expect((await editarContaAcao({}, form({ contaId: a.id, nome: "A2", usuarioInstagram: "" }))).ok).toBeTruthy();
    expect(await destinoDoRedirect(() => trocarContaAtiva(form({ contaId: a.id })))).toBe(`/contas/${a.id}`);
    expect(requisicaoFalsa.cookies.get(COOKIE_CONTA_ATIVA)).toBe(a.id);

    expect((await arquivarContaAcao({}, form({ contaId: a.id }))).erro).toContain("confirmação");
    expect(await destinoDoRedirect(() => arquivarContaAcao({}, form({ contaId: a.id, confirmo: "sim" })))).toBe("/contas");
    expect((await listarContas()).map((c) => c.nome)).toEqual(["B"]);
    expect((await listarContas({ arquivadas: true })).map((c) => c.nome)).toEqual(["A2"]);
    // Conta arquivada: as ações recusam.
    expect((await editarContaAcao({}, form({ contaId: a.id, nome: "X" }))).erro).toBe("Conta não encontrada ou arquivada.");
    expect((await criarProdutoAcao({}, form({ contaId: a.id, nome: "X" }))).erro).toBe("Conta não encontrada ou arquivada.");
    expect(await destinoDoRedirect(() => trocarContaAtiva(form({ contaId: a.id })))).toBe("/contas");
  });

  it("produtos: criar, trocar principal, não arquivar o principal e recusar produto de outra conta", async () => {
    await entrarComoGestor();
    const a = await novaConta("A", "a");
    const b = await novaConta("B", "b");
    expect((await criarProdutoAcao({}, form({ contaId: a.id, nome: "Mentoria" }))).ok).toBeTruthy();
    const mentoria = await db().produto.findFirstOrThrow({ where: { nome: "Mentoria" } });
    expect(mentoria.ordem).toBe(1);

    expect((await arquivarProdutoAcao({}, form({ contaId: a.id, produtoId: a.produtoPrincipalId! }))).erro).toContain("principal");
    expect((await definirPrincipalAcao({}, form({ contaId: a.id, produtoId: mentoria.id }))).ok).toBeTruthy();
    expect((await db().contaInstagram.findUniqueOrThrow({ where: { id: a.id } })).produtoPrincipalId).toBe(mentoria.id);
    expect((await arquivarProdutoAcao({}, form({ contaId: a.id, produtoId: a.produtoPrincipalId! }))).ok).toBeTruthy();

    // produto da conta A usado com a conta B
    expect((await definirPrincipalAcao({}, form({ contaId: b.id, produtoId: mentoria.id }))).erro).toBe("Produto não encontrado.");
    expect((await db().contaInstagram.findUniqueOrThrow({ where: { id: b.id } })).produtoPrincipalId).toBe(b.produtoPrincipalId);
  });
});
