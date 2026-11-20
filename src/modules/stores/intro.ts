import "server-only";
import { logEvent } from "@/lib/log";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { messagingAdapter } from "@/modules/ai";
import type { MessagingAdapter } from "@/modules/ai/adapter";
import { reviewWarnings, validateTranslateOutput, type TranslateInput } from "@/modules/ai/messaging-contract";
import { StoreIntro } from "./catalog-view";

export const INTRO_MAX_CHARS = 400;

/** Traduz para chinês o resumo da loja escrito pelo produtor. Nada é gravado aqui. */
export async function translateStoreIntro(
  textPt: string,
  adapter: MessagingAdapter = messagingAdapter(),
): Promise<{ ok: true; zh: string; warnings: string[] } | { ok: false; code: string }> {
  const input: TranslateInput = {
    text_pt: textPt,
    target_lang: "zh-Hans",
    context: { buyer_message: null, product_name: "Apresentação da loja do produtor (texto de topo do catálogo)" },
  };
  let code = "provider_error";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const started = Date.now();
    const result = await adapter.translateReply(input, attempt, { deadline: Date.now() + 25_000 });
    if (result.kind === "error") {
      logEvent("store.intro_translate", { status: result.code, attempt, ms: Date.now() - started });
      return { ok: false, code: result.code };
    }
    const checked = validateTranslateOutput(result.raw, input);
    logEvent("store.intro_translate", { status: checked.ok ? "ok" : "invalid_output", attempt, ms: Date.now() - started });
    if (checked.ok) return { ok: true, zh: checked.output.translation, warnings: reviewWarnings(input, checked.output) };
    code = "invalid_output";
  }
  return { ok: false, code };
}

/** Grava o resumo aprovado (português + chinês) na loja da sessão. */
export async function saveStoreIntro(storeId: string, pt: string, zh: string): Promise<StoreIntro> {
  const intro = StoreIntro.parse({ pt, zh, approved_at: new Date().toISOString() });
  const { error } = await supabaseAdmin().from("stores").update({ intro }).eq("id", storeId);
  if (error) throw new Error(`intro_save_failed: ${error.code}`);
  logEvent("store.intro_approved", { storeId });
  return intro;
}
