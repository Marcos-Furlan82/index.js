import Link from "next/link";
import { exigirSessao } from "@/auth/sessao";
import { lerContaAtiva } from "@/contas/conta-ativa";
import { obterDb } from "@/lib/db";
import { contarNaoLidas } from "@/notificacoes/notificacoes";
import { sair } from "./actions";
import { SeletorConta } from "./seletor-conta";

export const dynamic = "force-dynamic";

const MENU = [
  { href: "/", rotulo: "Início" },
  { href: "/contas", rotulo: "Contas" },
  { href: "/configuracoes/orcamento", rotulo: "Orçamento" },
  { href: "/configuracoes/sistema", rotulo: "Sistema" },
] as const;

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await exigirSessao();
  const [contas, ativa, naoLidas] = await Promise.all([
    obterDb().contaInstagram.findMany({ where: { arquivadaEm: null }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    lerContaAtiva(),
    contarNaoLidas(),
  ]);
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-6 px-4 py-3">
          <span className="font-semibold">Planejador de Instagram</span>
          <nav className="flex gap-4 text-sm">
            {MENU.map((item) => (
              <Link key={item.href} href={item.href} className="hover:underline">
                {item.rotulo}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <SeletorConta contas={contas} ativa={ativa} />
            <Link href="/notificacoes" className="hover:underline">
              Avisos{naoLidas > 0 && <span className="ml-1 rounded-full bg-red-600 px-2 text-xs text-white">{naoLidas}</span>}
            </Link>
            <span className="text-slate-600">{sessao.usuario.nome}</span>
            <form action={sair}>
              <button type="submit" className="rounded border border-slate-300 px-2 py-1">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
