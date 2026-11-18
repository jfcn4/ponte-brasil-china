import { NextResponse } from "next/server";

import { apiError } from "@/lib/http";
import { getConversationDetail } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";
import { Uuid, messagingRoute } from "../handlers";



/** Conversa completa para o produtor: traduções, análise e rascunho. */
export async function GET(request: Request, ctx: RouteContext<"/api/conversations/[conversationId]">) {
  return messagingRoute(
    request,
    "conversation.detail",
    "producer",
    async () => {
      const { conversationId } = await ctx.params;
      const storeId = await findCurrentStoreId();
      const detail = storeId && Uuid.safeParse(conversationId).success ? await getConversationDetail(storeId, conversationId) : null;
      if (!detail) return apiError(404, "not_found", "Conversa não encontrada nesta loja.");
      return NextResponse.json({ conversation: detail }, { headers: { "cache-control": "no-store" } });
    },
    { mutation: false },
  );
}
