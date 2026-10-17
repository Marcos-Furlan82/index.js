import { describe, expect, it } from "vitest";
import { urlHttp } from "./url";

describe("urlHttp", () => {
  it("aceita http e https", () => {
    expect(urlHttp(" https://hotmart.com/produto ")).toBe("https://hotmart.com/produto");
    expect(urlHttp("http://exemplo.com")).toBe("http://exemplo.com/");
  });

  it("recusa javascript:, data:, outros esquemas, texto solto e credenciais", () => {
    for (const ruim of [
      "javascript:alert(1)",
      "JAVASCRIPT:alert(1)",
      " javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "ftp://x.com",
      "hotmart.com/produto",
      "link na bio",
      "https://user:pass@x.com",
      "",
      null,
    ]) {
      expect(urlHttp(ruim), String(ruim)).toBeNull();
    }
  });
});
