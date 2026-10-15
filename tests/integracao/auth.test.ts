import { beforeEach, describe, expect, it } from "vitest";
import { destinoDoRedirect, requisicaoFalsa } from "./next-falso";
import { autenticar, MAX_FALHAS_IP, MSG_BLOQUEADO, MSG_CREDENCIAIS } from "@/auth/login";
import { buscarSessaoPorToken, exigirSessao, hashToken, nomeCookieSessao } from "@/auth/sessao";
import { entrar } from "@/app/login/actions";
import { sair } from "@/app/(painel)/actions";
import { obterDb } from "@/lib/db";
import { criarUsuario } from "./ajudantes";

const SENHA = "senha-de-teste-forte";
const db = () => obterDb();

function form(dados: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(dados)) f.set(k, v);
  return f;
}

beforeEach(() => requisicaoFalsa.limpar());

describe("autenticar", () => {
  it("login correto cria sessão (banco guarda só o hash)", async () => {
    const usuario = await criarUsuario();
    const r = await autenticar(db(), { email: " Gestor@Exemplo.com ", senha: SENHA, ip: "1.1.1.1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const sessao = await db().sessao.findFirstOrThrow();
    expect(sessao.tokenHash).toBe(hashToken(r.token));
    expect(sessao.usuarioId).toBe(usuario.id);
    expect(await buscarSessaoPorToken(db(), r.token)).toMatchObject({ usuario: { id: usuario.id } });
  });

  it("senha errada e e-mail inexistente dão a mesma mensagem e registram tentativa", async () => {
    await criarUsuario();
    const errada = await autenticar(db(), { email: "gestor@exemplo.com", senha: "errada-errada", ip: "1.1.1.1" });
    const inexistente = await autenticar(db(), { email: "ninguem@exemplo.com", senha: SENHA, ip: "1.1.1.1" });
    expect(errada).toEqual({ ok: false, erro: MSG_CREDENCIAIS });
    expect(inexistente).toEqual({ ok: false, erro: MSG_CREDENCIAIS });
    expect(await db().tentativaLogin.count({ where: { sucesso: false } })).toBe(2);
    expect(await db().sessao.count()).toBe(0);
  });

  it("bloqueia o IP após 10 falhas em 15 min, mesmo com a senha certa", async () => {
    await criarUsuario();
    const base = new Date("2026-10-15T12:00:00Z");
    await db().tentativaLogin.createMany({
      data: Array.from({ length: MAX_FALHAS_IP }, (_, i) => ({
        email: `outro${i}@exemplo.com`,
        ip: "6.6.6.6",
        sucesso: false,
        criadoEm: new Date(base.getTime() - 60_000),
      })),
    });
    const r = await autenticar(db(), { email: "gestor@exemplo.com", senha: SENHA, ip: "6.6.6.6" }, base);
    expect(r).toEqual({ ok: false, erro: MSG_BLOQUEADO });
    // Outro IP continua entrando.
    const outro = await autenticar(db(), { email: "gestor@exemplo.com", senha: SENHA, ip: "7.7.7.7" }, base);
    expect(outro.ok).toBe(true);
    // Passados 15 minutos, o IP volta a poder tentar.
    const depois = new Date(base.getTime() + 15 * 60_000);
    expect((await autenticar(db(), { email: "gestor@exemplo.com", senha: SENHA, ip: "6.6.6.6" }, depois)).ok).toBe(true);
  });

  it("por e-mail só atrasa (a partir da 4ª tentativa) e não verifica a senha durante a espera", async () => {
    await criarUsuario();
    const t0 = new Date("2026-10-15T12:00:00Z");
    for (let i = 0; i < 3; i++) {
      const r = await autenticar(db(), { email: "gestor@exemplo.com", senha: "errada-errada", ip: `2.2.2.${i}` }, t0);
      expect(r).toEqual({ ok: false, erro: MSG_CREDENCIAIS });
    }
    // 4ª tentativa imediata: aguarde 1 s, sem registrar tentativa.
    const espera = await autenticar(db(), { email: "gestor@exemplo.com", senha: SENHA, ip: "3.3.3.3" }, t0);
    expect(espera).toMatchObject({ ok: false, aguardarSegundos: 1 });
    expect(await db().tentativaLogin.count()).toBe(3);
    // Depois do atraso, a senha certa entra.
    const t1 = new Date(t0.getTime() + 1000);
    expect((await autenticar(db(), { email: "gestor@exemplo.com", senha: SENHA, ip: "3.3.3.3" }, t1)).ok).toBe(true);
  });

  it("sessão expirada não vale", async () => {
    await criarUsuario();
    const r = await autenticar(db(), { email: "gestor@exemplo.com", senha: SENHA, ip: "1.1.1.1" });
    if (!r.ok) throw new Error("login falhou");
    const depois = new Date(r.expiraEm.getTime() + 1);
    expect(await buscarSessaoPorToken(db(), r.token, depois)).toBeNull();
  });
});

describe("server actions de login e logout", () => {
  it("entrar grava o cookie e redireciona; sair revoga a sessão", async () => {
    await criarUsuario();
    requisicaoFalsa.headers = new Headers({ "x-nf-client-connection-ip": "4.4.4.4", "user-agent": "teste" });
    const destino = await destinoDoRedirect(() =>
      entrar({}, form({ email: "gestor@exemplo.com", senha: SENHA })),
    );
    expect(destino).toBe("/");
    const token = requisicaoFalsa.cookies.get(nomeCookieSessao());
    expect(token).toBeTruthy();
    expect((await exigirSessao()).usuario.email).toBe("gestor@exemplo.com");
    expect(await db().sessao.findFirst()).toMatchObject({ ip: "4.4.4.4", userAgent: "teste" });

    expect(await destinoDoRedirect(() => sair())).toBe("/login");
    expect(requisicaoFalsa.cookies.has(nomeCookieSessao())).toBe(false);
    expect(await db().sessao.count()).toBe(0);
    expect(await buscarSessaoPorToken(db(), token)).toBeNull();
  });

  it("entrar com senha errada devolve erro genérico", async () => {
    await criarUsuario();
    const estado = await entrar({}, form({ email: "gestor@exemplo.com", senha: "errada-errada" }));
    expect(estado).toEqual({ erro: MSG_CREDENCIAIS });
    expect(requisicaoFalsa.cookies.size).toBe(0);
  });

  it("entrar valida os campos", async () => {
    expect(await entrar({}, form({ email: "nao-e-email", senha: "" }))).toEqual({
      erro: "Informe e-mail e senha.",
    });
  });

  it("exigirSessao sem cookie redireciona para o login", async () => {
    expect(await destinoDoRedirect(() => exigirSessao())).toBe("/login");
    requisicaoFalsa.cookies.set(nomeCookieSessao(), "token-inventado");
    expect(await destinoDoRedirect(() => exigirSessao())).toBe("/login");
  });
});
