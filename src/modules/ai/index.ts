import "server-only";
import { serverEnv } from "@/lib/env.server";
import type { AdapterResult, IdentityAdapter } from "./adapter";
import { GeminiIdentityAdapter } from "./gemini";
import { createTestAdapter } from "./test-adapter";

/** Modelo Flash usado quando GEMINI_MODEL não é informado. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const notConfigured: IdentityAdapter = {
  model: "gemini:not-configured",
  async generateIdentity(): Promise<AdapterResult> {
    return { kind: "error", code: "not_configured", detail: "GEMINI_API_KEY ausente" };
  },
};

/** Adaptador configurado para este ambiente (somente servidor). */
export function identityAdapter(): IdentityAdapter {
  const env = serverEnv();
  if (env.AI_MODE === "test") return createTestAdapter();
  if (!env.GEMINI_API_KEY) return notConfigured;
  return new GeminiIdentityAdapter(env.GEMINI_API_KEY, env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL);
}
