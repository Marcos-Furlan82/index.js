import Link from "next/link";
import { FormularioAcao } from "@/componentes/formulario-acao";
import { formatarDataHora } from "@/lib/datas";
import { listarNotificacoes } from "@/notificacoes/notificacoes";
import { marcarTodasComoLidas } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaginaNotificacoes() {
  const avisos = await listarNotificacoes();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Avisos</h1>
      <FormularioAcao acao={marcarTodasComoLidas} rotuloBotao="Marcar todos como lidos" />
      {avisos.length === 0 ? (
        <p className="text-sm text-slate-600">Nenhum aviso por enquanto.</p>
      ) : (
        <ul className="space-y-2">
          {avisos.map((a) => (
            <li
              key={a.id}
              className={`rounded-lg border p-3 text-sm ${a.lidaEm ? "border-slate-200 bg-white" : "border-blue-200 bg-blue-50"}`}
            >
              <p className="font-medium">
                {a.titulo}
                {a.conta && <span className="ml-2 font-normal text-slate-500">· {a.conta.nome}</span>}
              </p>
              <p>{a.mensagem}</p>
              <p className="text-xs text-slate-500">
                {formatarDataHora(a.criadoEm)}
                {a.link && (
                  <>
                    {" · "}
                    <Link href={a.link} className="underline">
                      Abrir
                    </Link>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
