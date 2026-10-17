import { describe, expect, it } from "vitest";
import { atrasoPorFalhas } from "./login";

describe("atraso progressivo por e-mail", () => {
  it.each([
    [0, 0],
    [2, 0],
    [3, 1],
    [4, 2],
    [5, 4],
    [6, 8],
    [20, 8],
  ])("%i falhas → %i s", (falhas, segundos) => {
    expect(atrasoPorFalhas(falhas)).toBe(segundos);
  });
});
