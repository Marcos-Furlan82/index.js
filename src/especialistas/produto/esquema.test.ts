import { describe, expect, it } from "vitest";
import { esquemaParaJson } from "@/ia/claude";
import { BLOCOS_FICHA, CAMPOS_FICHA, esquemaSaidaIA } from "./esquema";

describe("esquema de saída da IA", () => {
  const json = esquemaParaJson(esquemaSaidaIA);
  const texto = JSON.stringify(json);

  it("sem record, sem limites e com todo objeto fechado", () => {
    for (const proibido of ["propertyNames", "patternProperties", "minLength", "maxLength", "minItems", "maxItems", "minimum", "maximum", "$schema"]) {
      expect(texto, proibido).not.toContain(proibido);
    }
    const visitar = (no: unknown): void => {
      if (Array.isArray(no)) return no.forEach(visitar);
      if (!no || typeof no !== "object") return;
      const o = no as Record<string, unknown>;
      if (o.type === "object") {
        expect(o.additionalProperties).toBe(false);
        expect(o.required).toEqual(Object.keys(o.properties as object));
      }
      Object.values(o).forEach(visitar);
    };
    visitar(json);
  });

  it("a IA só pode emitir pendências 'melhora' e campos conhecidos", () => {
    expect(texto).toContain('"criticidade":{"type":"string","enum":["melhora"]}');
    expect(texto).not.toContain("bloqueia");
  });

  it("todo campo da ficha pertence a exatamente um bloco", () => {
    const campos = BLOCOS_FICHA.flatMap((b) => b.campos as readonly string[]);
    expect([...campos].sort()).toEqual([...CAMPOS_FICHA].sort());
  });
});
