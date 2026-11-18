import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { AI_ERROR_MESSAGES, DraftRequest } from "@/modules/messaging/schema";
import { translateReplyDraft } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";
import { Uuid, messagingRoute } from "../../../handlers";

export const maxDuration = 60;

/**
 * “Revisar tradução”: grava o texto em português e traduz essa revisão para
 * o idioma do comprador. Não envia nada. Em falha, o texto continua salvo.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[conversationId]/draft/translation">) {
  return messagingRoute(request, "reply.translate", "producer", async () => {
    const { conversationId } = await ctx.params;
    const body = DraftRequest.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Escreva a resposta (até 2000 caracteres).", body.error.issues);
    const storeId = await findCurrentStoreId();
    if (!storeId || !Uuid.safeParse(conversationId).success) return apiError(404, "not_found", "Conversa não encontrada nesta loja.");

    const { draft, outcome } = await translateReplyDraft(storeId, conversationId, body.data.expectedRevision, body.data.body);
    if (outcome === "ready") return NextResponse.json({ draft });
    if (outcome === "busy") {
      return NextResponse.json(
        { draft, error: { code: "translation_in_progress", message: "Já existe uma tradução em andamento para este texto." } },
        { status: 409 },
      );
    }
    if (outcome === "stale") {
      return NextResponse.json(
        { draft, error: { code: "translation_stale", message: "O texto mudou durante a tradução. Revise a tradução novamente." } },
        { status: 409 },
      );
    }
    const code = draft.translation.status === "failed" ? (draft.translation.error ?? "provider_error") : "provider_error";
    return NextResponse.json(
      {
        draft,
        error: {
          code: "translation_failed",
          message: `${AI_ERROR_MESSAGES[code] ?? AI_ERROR_MESSAGES.provider_error} Seu texto em português foi mantido.`,
        },
      },
      { status: 502 },
    );
  });
}
