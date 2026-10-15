"use client";

import { useState } from "react";
import { confirmarUploadTeste, solicitarUploadTeste } from "./actions";

type Estado =
  | { fase: "parado" }
  | { fase: "enviando"; progresso: number }
  | { fase: "ok"; url: string }
  | { fase: "erro"; mensagem: string };

function enviarComProgresso(url: string, arquivo: File, aoProgredir: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", arquivo.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgredir(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Falha de rede (confira o CORS do bucket)."));
    xhr.send(arquivo);
  });
}

export function UploadTeste() {
  const [estado, setEstado] = useState<Estado>({ fase: "parado" });

  async function aoEscolher(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo) return;
    setEstado({ fase: "enviando", progresso: 0 });
    try {
      const pedido = await solicitarUploadTeste({
        tipoMime: arquivo.type,
        tamanhoBytes: arquivo.size,
        nomeOriginal: arquivo.name,
      });
      if (!pedido.ok) return setEstado({ fase: "erro", mensagem: pedido.erro });
      await enviarComProgresso(pedido.url, arquivo, (progresso) => setEstado({ fase: "enviando", progresso }));
      const confirmado = await confirmarUploadTeste(pedido.midiaId);
      setEstado(confirmado.ok ? { fase: "ok", url: confirmado.urlPublica } : { fase: "erro", mensagem: confirmado.erro });
    } catch (erro) {
      setEstado({ fase: "erro", mensagem: erro instanceof Error ? erro.message : "Falha no envio." });
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={aoEscolher}
        disabled={estado.fase === "enviando"}
        className="text-sm"
      />
      {estado.fase === "enviando" && <p className="text-sm">Enviando... {estado.progresso}%</p>}
      {estado.fase === "ok" && (
        <p className="text-sm text-green-700">
          Arquivo disponível:{" "}
          <a href={estado.url} target="_blank" rel="noreferrer" className="underline">
            abrir
          </a>
        </p>
      )}
      {estado.fase === "erro" && (
        <p role="alert" className="text-sm text-red-700">
          {estado.mensagem}
        </p>
      )}
    </div>
  );
}
