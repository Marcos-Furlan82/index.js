import { describe, expect, it } from "vitest";
import { segredoConfere } from "./segredo";

const SEGREDO = "um-segredo-com-mais-de-trinta-e-dois-caracteres";

describe("segredoConfere", () => {
  it("aceita só o segredo exato", () => {
    expect(segredoConfere(SEGREDO, SEGREDO)).toBe(true);
    expect(segredoConfere(`${SEGREDO}x`, SEGREDO)).toBe(false);
    expect(segredoConfere("curto", SEGREDO)).toBe(false);
    expect(segredoConfere("", SEGREDO)).toBe(false);
    expect(segredoConfere(null, SEGREDO)).toBe(false);
    expect(segredoConfere(SEGREDO, "")).toBe(false);
  });
});
