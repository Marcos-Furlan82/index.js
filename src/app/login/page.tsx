import { redirect } from "next/navigation";
import { lerSessao } from "@/auth/sessao";
import { FormularioLogin } from "./formulario-login";

export const dynamic = "force-dynamic";

export default async function PaginaLogin() {
  if (await lerSessao()) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold">Entrar no painel</h1>
        <FormularioLogin />
      </div>
    </main>
  );
}
