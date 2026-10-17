"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Estado =
  | { fase: "parado" }
  | { fase: "enviando"; progresso: number; nome: string }
  | { fase: "conferindo"; nome: string }
  | { fase: "ok"; avisos: string[] }
  | { fase: "erro"; mensagem: string };

function enviarComProgresso(url: string, arquivo: File, tipoMime: string, aoProgredir: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", tipoMime);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgredir(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Falha de rede ao enviar o arquivo."));
    xhr.send(arquivo);
  });
}

export type Solicitar = (dados: {
  tipoMime: string;
  tamanhoBytes: number;
  nomeOriginal: string;
}) => Promise<{ ok: true; midiaId: string; url: string; tipoMime: string } | { ok: false; erro: string }>;
export type Confirmar = (midiaId: string) => Promise<{ ok: true; avisos?: string[] } | { ok: false; erro: string }>;

/**
 * Envio direto do navegador para o armazenamento (URL assinada), um arquivo
 * por vez, com progresso, conferência no servidor e avisos.
 */
export function UploadArquivo({
  rotulo,
  aceitar,
  solicitar,
  confirmar,
  multiplos = false,
  desabilitado = false,
}: {
  rotulo: string;
  aceitar: string;
  solicitar: Solicitar;
  confirmar: Confirmar;
  multiplos?: boolean;
  desabilitado?: boolean;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ fase: "parado" });

  async function enviarUm(arquivo: File): Promise<string[] | string> {
    setEstado({ fase: "enviando", progresso: 0, nome: arquivo.name });
    const pedido = await solicitar({ tipoMime: arquivo.type, tamanhoBytes: arquivo.size, nomeOriginal: arquivo.name });
    if (!pedido.ok) return pedido.erro;
    await enviarComProgresso(pedido.url, arquivo, pedido.tipoMime, (progresso) =>
      setEstado({ fase: "enviando", progresso, nome: arquivo.name }),
    );
    setEstado({ fase: "conferindo", nome: arquivo.name });
    const c = await confirmar(pedido.midiaId);
    return c.ok ? (c.avisos ?? []) : c.erro;
  }

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = [...(evento.target.files ?? [])];
    evento.target.value = "";
    const avisos: string[] = [];
    for (const arquivo of arquivos) {
      try {
        const r = await enviarUm(arquivo);
        if (typeof r === "string") {
          setEstado({ fase: "erro", mensagem: `${arquivo.name}: ${r}` });
          router.refresh();
          return;
        }
        avisos.push(...r.map((a) => `${arquivo.name}: ${a}`));
      } catch (erro) {
        setEstado({ fase: "erro", mensagem: `${arquivo.name}: ${erro instanceof Error ? erro.message : "falha no envio."}` });
        return;
      }
    }
    setEstado({ fase: "ok", avisos });
    router.refresh();
  }

  const ocupado = estado.fase === "enviando" || estado.fase === "conferindo";
  return (
    <div className="space-y-2">
      <label className="inline-block cursor-pointer rounded border border-slate-300 bg-white px-3 py-2 text-sm">
        {rotulo}
        <input type="file" accept={aceitar} multiple={multiplos} disabled={ocupado || desabilitado} onChange={aoEscolher} className="sr-only" />
      </label>
      {estado.fase === "enviando" && (
        <p className="text-sm">
          Enviando {estado.nome}… {estado.progresso}%
        </p>
      )}
      {estado.fase === "conferindo" && <p className="text-sm">Conferindo {estado.nome}…</p>}
      {estado.fase === "ok" && (
        <div className="text-sm text-emerald-700">
          <p>Enviado.</p>
          {estado.avisos.map((a) => (
            <p key={a} className="text-amber-700">
              {a}
            </p>
          ))}
        </div>
      )}
      {estado.fase === "erro" && (
        <p role="alert" className="text-sm text-red-700">
          {estado.mensagem}
        </p>
      )}
    </div>
  );
}
