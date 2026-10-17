import { obterDb } from "@/lib/db";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

/** Verificação simples: o app responde e alcança o banco. */
export async function GET() {
  try {
    await obterDb().$queryRaw`SELECT 1`;
    return Response.json({ ok: true, banco: "ok" });
  } catch (erro) {
    log.error("saude: banco indisponível", { erro });
    return Response.json({ ok: false, banco: "indisponivel" }, { status: 503 });
  }
}
