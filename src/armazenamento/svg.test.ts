import { describe, expect, it } from "vitest";
import { sanitizarSvg } from "./svg";

const LIMPO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#c2185b"></circle></svg>';

describe("sanitizarSvg", () => {
  it("SVG simples passa sem mudança", () => {
    const r = sanitizarSvg(LIMPO);
    expect(r).toMatchObject({ ok: true, mudou: false });
  });

  it("remove script, foreignObject, on* e links externos", () => {
    const malicioso = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">
      <script>alert(document.cookie)</script>
      <foreignObject><iframe src="https://mal.example"></iframe></foreignObject>
      <a href="javascript:alert(1)"><rect width="5" height="5"/></a>
      <use xlink:href="https://mal.example/x.svg#a"/>
      <use href="#local"/>
      <image href="data:image/png;base64,iVBORw0KGgo="/>
      <rect style="fill:url(https://mal.example/x.png)" width="1" height="1"/>
      <circle id="local" r="1" onclick="alert(1)"/>
    </svg>`;
    const r = sanitizarSvg(malicioso);
    if (!r.ok) throw new Error(r.erro);
    expect(r.mudou).toBe(true);
    for (const proibido of ["<script", "foreignObject", "iframe", "onload", "onclick", "javascript:", "mal.example"]) {
      expect(r.svg, proibido).not.toContain(proibido);
    }
    expect(r.svg).toContain('href="#local"');
    expect(r.svg).toContain("data:image/png;base64");
  });

  it("recusa DOCTYPE/ENTITY e arquivo sem svg", () => {
    expect(sanitizarSvg('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa">]><svg>&a;</svg>').ok).toBe(false);
    expect(sanitizarSvg("<html><script>x</script></html>").ok).toBe(false);
  });
});
