import "server-only";
import { serverEnv } from "@/lib/env.server";
import type { AdapterResult, IdentityAdapter, MessagingAdapter } from "./adapter";
import { GeminiIdentityAdapter, GeminiMessagingAdapter } from "./gemini";
import { createTestAdapter, createTestMessagingAdapter } from "./test-adapter";

/** Modelo Flash usado quando GEMINI_MODEL não é informado. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

const NOT_CONFIGURED_MODEL = "gemini:not-configured";
const notConfiguredResult = async (): Promise<AdapterResult> => ({
  kind: "error",
  code: "not_configured",
  detail: "GEMINI_API_KEY ausente",
});

const notConfigured: IdentityAdapter = { model: NOT_CONFIGURED_MODEL, generateIdentity: notConfiguredResult };
const messagingNotConfigured: MessagingAdapter = {
  model: NOT_CONFIGURED_MODEL,
  interpretInquiry: notConfiguredResult,
  translateReply: notConfiguredResult,
};

/** Adaptador da operação 1 configurado para este ambiente (somente servidor). */
export function identityAdapter(): IdentityAdapter {
  const env = serverEnv();
  if (env.AI_MODE === "test") return createTestAdapter();
  if (!env.GEMINI_API_KEY) return notConfigured;
  return new GeminiIdentityAdapter(env.GEMINI_API_KEY, env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL);
}

/** Adaptador das operações 2 e 3 configurado para este ambiente (somente servidor). */
export function messagingAdapter(): MessagingAdapter {
  const env = serverEnv();
  if (env.AI_MODE === "test") return createTestMessagingAdapter();
  if (!env.GEMINI_API_KEY) return messagingNotConfigured;
  return new GeminiMessagingAdapter(env.GEMINI_API_KEY, env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL);
}
