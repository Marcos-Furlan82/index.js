import { z } from "zod";

/**
 * Variáveis de ambiente, validadas por grupo e só quando usadas.
 * Assim o build (que não usa R2, e-mail etc.) roda sem todas as variáveis.
 */

const inteiroPositivo = (padrao: number) =>
  z.coerce.number().int().positive().default(padrao);

const esquemas = {
  banco: z.object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL não definida"),
    DB_POOL_MAX: z.coerce.number().int().positive().optional(),
  }),
  app: z.object({
    APP_URL: z.string().url().optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  }),
  jobs: z.object({
    JOBS_SECRET: z.string().min(32, "JOBS_SECRET precisa ter pelo menos 32 caracteres"),
    JOBS_PARALELISMO: inteiroPositivo(2),
  }),
  r2: z.object({
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    R2_PUBLIC_BASE_URL: z.string().url(),
  }),
  /** Bucket privado (referências da marca): sem domínio público, leitura só por URL assinada. */
  r2Privado: z.object({
    R2_BUCKET_PRIVADO: z.string().min(1, "R2_BUCKET_PRIVADO não definida"),
  }),
  /**
   * Claude API. A chave só é exigida na hora de chamar a API (src/ia/claude.ts);
   * o modelo e o fallback são lidos também para estimar custos.
   */
  ia: z.object({
    ANTHROPIC_API_KEY: z.string().optional(),
    IA_MODELO_TEXTO: z.string().min(1).optional(),
    IA_FALLBACK: z.enum(["default", "desligado"]).default("default"),
  }),
  email: z
    .object({
      EMAIL_PROVEDOR: z.enum(["resend", "console", "memoria"]).default("console"),
      RESEND_API_KEY: z.string().optional(),
      EMAIL_REMETENTE: z.string().optional(),
    })
    .refine(
      (v) => v.EMAIL_PROVEDOR !== "resend" || (!!v.RESEND_API_KEY && !!v.EMAIL_REMETENTE),
      { message: "Com EMAIL_PROVEDOR=resend, defina RESEND_API_KEY e EMAIL_REMETENTE" },
    ),
} as const;

type Esquemas = typeof esquemas;
export type GrupoEnv = keyof Esquemas;
export type Env<G extends GrupoEnv> = z.infer<Esquemas[G]>;

const cache = new Map<GrupoEnv, unknown>();

export function lerEnv<G extends GrupoEnv>(grupo: G): Env<G> {
  if (cache.has(grupo)) return cache.get(grupo) as Env<G>;
  const resultado = esquemas[grupo].safeParse(process.env);
  if (!resultado.success) {
    // Só os nomes das variáveis e a mensagem; nunca os valores.
    const problemas = resultado.error.issues
      .map((i) => `${i.path.join(".") || grupo}: ${i.message}`)
      .join("; ");
    throw new Error(`Configuração inválida (${grupo}): ${problemas}`);
  }
  cache.set(grupo, resultado.data);
  return resultado.data as Env<G>;
}

/** Só para testes: esquece os valores lidos. */
export function limparCacheEnv() {
  cache.clear();
}

export function emProducao() {
  return process.env.NODE_ENV === "production";
}
