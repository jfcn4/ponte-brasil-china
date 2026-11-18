import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { DraftRequest } from "@/modules/messaging/schema";
import { saveReplyDraft } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";
import { Uuid, messagingRoute } from "../../handlers";

/** Guarda o texto da resposta em português (sem traduzir nem enviar). */
export async function PUT(request: Request, ctx: RouteContext<"/api/conversations/[conversationId]/draft">) {
  return messagingRoute(request, "reply.draft", "producer", async () => {
    const { conversationId } = await ctx.params;
    const body = DraftRequest.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Escreva a resposta (até 2000 caracteres).", body.error.issues);
    const storeId = await findCurrentStoreId();
    if (!storeId || !Uuid.safeParse(conversationId).success) return apiError(404, "not_found", "Conversa não encontrada nesta loja.");
    const draft = await saveReplyDraft(storeId, conversationId, body.data.expectedRevision, body.data.body);
    return NextResponse.json({ draft });
  });
}
