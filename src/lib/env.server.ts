import "server-only";
import { z } from "zod";

const ServerEnv = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  SUPABASE_STORAGE_BUCKET: z.string().min(3).default("product-images"),
  /** Origem pública dos links e QRs. Sem valor, usa o domínio de produção da Vercel ou o host da requisição. */
  APP_URL: z.url().optional().or(z.literal("").transform(() => undefined)),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
  /** "gemini" chama a API real; "test" usa respostas determinísticas (testes e ensaio sem cota). */
  AI_MODE: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["gemini", "test"]).default("gemini")),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().regex(/^[a-z0-9.-]+$/).optional().or(z.literal("").transform(() => undefined)),
  /** Modelos reserva (separados por vírgula) para sobrecarga do principal; "off" desliga. */
  GEMINI_FALLBACK_MODEL: z.string().regex(/^[a-z0-9.-]+(,[a-z0-9.-]+)*$/).optional().or(z.literal("").transform(() => undefined)),
});

export type ServerEnv = z.infer<typeof ServerEnv>;

let cached: ServerEnv | undefined;

/** Lê e valida a configuração do servidor. Informa o nome da variável ausente, nunca o valor. */
export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = ServerEnv.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Configuração do servidor incompleta: ${missing}`);
  }
  cached = parsed.data;
  return cached;
}
