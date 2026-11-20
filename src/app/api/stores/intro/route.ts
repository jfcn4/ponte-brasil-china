import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/http";
import { INTRO_MAX_CHARS, saveStoreIntro, translateStoreIntro } from "@/modules/stores/intro";
import { requireExistingStoreId } from "@/modules/stores/session";
import { mutation } from "../../products/handlers";

const Text = z.string().trim().min(10).max(INTRO_MAX_CHARS);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("translate"), pt: Text }).strict(),
  z.object({ action: z.literal("approve"), pt: Text, zh: z.string().trim().min(2).max(1200) }).strict(),
]);

/** Traduz (prévia) ou aprova (grava) a apresentação da loja escrita pelo produtor. */
export async function POST(request: Request) {
  return mutation(request, "store.intro", async () => {
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Escreva entre 10 e 400 caracteres.", body.error.issues);
    const storeId = await requireExistingStoreId();
    if (!storeId) return apiError(404, "not_found", "Loja não encontrada neste navegador.");

    if (body.data.action === "translate") {
      const result = await translateStoreIntro(body.data.pt);
      if (!result.ok) return apiError(502, "translation_failed", "Não foi possível traduzir agora. Seu texto continua salvo na tela; tente de novo.");
      return NextResponse.json({ zh: result.zh, warnings: result.warnings });
    }
    const intro = await saveStoreIntro(storeId, body.data.pt, body.data.zh);
    return NextResponse.json({ intro });
  });
}
