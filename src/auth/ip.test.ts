import { describe, expect, it } from "vitest";
import { IP_DESCONHECIDO, obterIpCliente } from "./ip";

describe("obterIpCliente", () => {
  it("usa o header do Netlify", () => {
    const h = new Headers({ "x-nf-client-connection-ip": "200.1.2.3", "x-forwarded-for": "9.9.9.9" });
    expect(obterIpCliente(h, true)).toBe("200.1.2.3");
  });

  it("em produção ignora x-forwarded-for (forjável)", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9" });
    expect(obterIpCliente(h, true)).toBe(IP_DESCONHECIDO);
  });

  it("em desenvolvimento aceita x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" });
    expect(obterIpCliente(h, false)).toBe("9.9.9.9");
  });
});
