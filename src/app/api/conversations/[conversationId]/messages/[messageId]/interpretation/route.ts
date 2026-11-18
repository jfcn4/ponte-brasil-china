import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getConversationDetail, retryInterpretation } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";
import { Uuid, messagingRoute } from "../../../../handlers";

export const maxDuration = 60;

/** “Tentar novamente”: refaz a tradução e a análise de uma entrada (o original já está salvo). */
export async function POST(
  request: Request,
  ctx: RouteContext<"/api/conversations/[conversationId]/messages/[messageId]/interpretation">,
) {
  return messagingRoute(request, "interpretation.retry", "producer", async () => {
    const { conversationId, messageId } = await ctx.params;
    const storeId = await findCurrentStoreId();
    if (!storeId || !Uuid.safeParse(conversationId).success || !Uuid.safeParse(messageId).success) {
      return apiError(404, "not_found", "Conversa não encontrada nesta loja.");
    }
    const outcome = await retryInterpretation(storeId, conversationId, messageId);
    const conversation = await getConversationDetail(storeId, conversationId);
    return NextResponse.json({ outcome, conversation }, { status: outcome === "failed" ? 502 : 200 });
  });
}
