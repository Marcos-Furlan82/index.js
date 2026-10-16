import { describe, expect, it, vi } from "vitest";
import { codigoPrisma, comRetryDeBanco, erroDeBancoTransitorio } from "./retry-banco";

function erroPrisma(code: string, name = "PrismaClientKnownRequestError") {
  return Object.assign(new Error("falha"), { name, code });
}

describe("retry de banco", () => {
  it("reconhece só códigos transitórios do Prisma", () => {
    expect(erroDeBancoTransitorio(erroPrisma("P1001"))).toBe(true);
    expect(erroDeBancoTransitorio(Object.assign(new Error(), { name: "PrismaClientInitializationError", errorCode: "P1017" }))).toBe(true);
    expect(erroDeBancoTransitorio(erroPrisma("P2002"))).toBe(false);
    expect(erroDeBancoTransitorio(Object.assign(new Error(), { code: "P1001" }))).toBe(false);
    expect(codigoPrisma("x")).toBeUndefined();
  });

  it("repete 3 vezes com as esperas e depois desiste", async () => {
    const dormir = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw erroPrisma("P2034");
    });
    await expect(comRetryDeBanco(fn, [200, 1000, 3000], dormir)).rejects.toThrow("falha");
    expect(fn).toHaveBeenCalledTimes(4);
    expect(dormir.mock.calls.map((c) => (c as unknown[])[0])).toEqual([200, 1000, 3000]);
  });

  it("devolve quando uma repetição dá certo e não repete erro permanente", async () => {
    let n = 0;
    const ok = await comRetryDeBanco(async () => (++n < 2 ? Promise.reject(erroPrisma("P1001")) : "ok"), [0, 0, 0], async () => {});
    expect(ok).toBe("ok");
    const fn = vi.fn(async () => Promise.reject(erroPrisma("P2002")));
    await expect(comRetryDeBanco(fn, [0, 0, 0], async () => {})).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
