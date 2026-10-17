"use client";

/** Lista de itens com id estável: adicionar, editar (render) e remover. */
export function ListaRepetivel<T extends { id: string }>({
  itens,
  aoMudar,
  novoItem,
  renderItem,
  rotuloAdicionar,
  maximo,
  desabilitado,
}: {
  itens: T[];
  aoMudar: (itens: T[], imediato?: boolean) => void;
  novoItem: () => T;
  renderItem: (item: T, atualizar: (parcial: Partial<T>, imediato?: boolean) => void) => React.ReactNode;
  rotuloAdicionar: string;
  maximo?: number;
  desabilitado?: boolean;
}) {
  return (
    <div className="space-y-3">
      {itens.map((item) => (
        <div key={item.id} className="space-y-2 rounded border border-slate-200 p-3">
          {renderItem(item, (parcial, imediato) =>
            aoMudar(
              itens.map((i) => (i.id === item.id ? { ...i, ...parcial } : i)),
              imediato,
            ),
          )}
          {!desabilitado && (
            <button
              type="button"
              onClick={() => aoMudar(itens.filter((i) => i.id !== item.id), true)}
              className="text-sm text-red-700 underline"
            >
              Remover
            </button>
          )}
        </div>
      ))}
      {!desabilitado && (maximo === undefined || itens.length < maximo) && (
        <button
          type="button"
          onClick={() => aoMudar([...itens, novoItem()], true)}
          className="rounded border border-slate-300 px-3 py-1 text-sm"
        >
          {rotuloAdicionar}
        </button>
      )}
    </div>
  );
}
