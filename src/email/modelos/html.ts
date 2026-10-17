export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Moldura simples e legível em qualquer cliente de e-mail. */
export function moldura(titulo: string, paragrafos: string[]): string {
  const corpo = paragrafos.map((p) => `<p style="margin:0 0 12px">${escaparHtml(p)}</p>`).join("");
  return `<!doctype html><html lang="pt-BR"><body style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5">` +
    `<h1 style="font-size:18px">${escaparHtml(titulo)}</h1>${corpo}` +
    `<p style="color:#64748b;font-size:12px">Planejador de Instagram</p></body></html>`;
}
