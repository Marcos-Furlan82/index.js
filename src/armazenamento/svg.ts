import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

/**
 * Limpa um SVG enviado pelo usuário antes de guardá-lo:
 * - recusa DOCTYPE/ENTITY (bomba de entidades, XXE);
 * - DOMPurify com o perfil SVG (sem script, foreignObject, on*, etc.);
 * - href/xlink:href só "#id" ou imagem embutida PNG/JPEG (data:);
 * - url(...) externo em style vira "none".
 * Devolve o SVG limpo e se algo mudou.
 */
export type ResultadoSvg = { ok: true; svg: string; mudou: boolean } | { ok: false; erro: string };

const HREF_PERMITIDO = /^(#[\w.-]+|data:image\/(png|jpeg);base64,[A-Za-z0-9+/=\s]+)$/i;
const URL_EXTERNA = /url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi;

let purificador: ReturnType<typeof DOMPurify> | undefined;

function obterPurificador() {
  if (purificador) return purificador;
  const { window } = new JSDOM("");
  const p = DOMPurify(window as unknown as Parameters<typeof DOMPurify>[0]);
  p.addHook("uponSanitizeAttribute", (_no, dados) => {
    const nome = dados.attrName.toLowerCase();
    if (nome === "href" || nome === "xlink:href") {
      if (!HREF_PERMITIDO.test(dados.attrValue.trim())) dados.keepAttr = false;
    }
    if (nome === "style") dados.attrValue = dados.attrValue.replace(URL_EXTERNA, "none");
    if (/^on/i.test(nome)) dados.keepAttr = false;
  });
  p.addHook("uponSanitizeElement", (no, dados) => {
    if (dados.tagName === "style" && no.textContent) no.textContent = no.textContent.replace(URL_EXTERNA, "none");
  });
  purificador = p;
  return p;
}

function normalizar(svg: string) {
  return svg.replace(/^﻿/, "").replace(/<\?xml[^>]*\?>/i, "").replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();
}

export function sanitizarSvg(texto: string): ResultadoSvg {
  if (/<!DOCTYPE|<!ENTITY/i.test(texto)) {
    return { ok: false, erro: "Este SVG usa recursos não permitidos (DOCTYPE). Exporte de novo como SVG simples." };
  }
  const limpo = obterPurificador().sanitize(texto, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["foreignObject", "script", "iframe", "embed", "object", "a"],
    // <use> é comum em logos exportados; o hook só deixa href "#id" ou imagem embutida.
    ADD_TAGS: ["use"],
    ADD_ATTR: ["xlink:href"],
  });
  if (!/<svg[\s>]/i.test(limpo)) return { ok: false, erro: "Não encontramos um desenho SVG válido neste arquivo." };
  return { ok: true, svg: limpo, mudou: normalizar(limpo) !== normalizar(texto) };
}
