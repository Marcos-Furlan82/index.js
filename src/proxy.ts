import { NextResponse, type NextRequest } from "next/server";

/**
 * Checagem otimista: sem cookie de sessão, manda para o login.
 * A validação de verdade (banco) acontece em exigirSessao(), no layout do
 * painel e em cada server action.
 */
const COOKIES_SESSAO = ["__Host-sessao", "sessao"];

export function proxy(request: NextRequest) {
  const temCookie = COOKIES_SESSAO.some((nome) => request.cookies.has(nome));
  if (temCookie) return NextResponse.next();
  const destino = new URL("/login", request.url);
  return NextResponse.redirect(destino);
}

export const config = {
  // Tudo, menos login, APIs públicas (/api/saude), arquivos do Next e estáticos.
  matcher: ["/((?!login|api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
