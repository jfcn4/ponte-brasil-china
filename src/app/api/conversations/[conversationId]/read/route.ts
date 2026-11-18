import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { ReadRequest } from "@/modules/messaging/schema";
import { markConversationRead } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";
import { Uuid, messagingRoute } from "../../handlers";

/** Marca como lidas as entradas até a última que o painel exibiu. */
export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[conversationId]/read">) {
  return messagingRoute(request, "conversation.read", "producer", async () => {
    const { conversationId } = await ctx.params;
    const body = ReadRequest.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Pedido inválido.", body.error.issues);
    const storeId = await findCurrentStoreId();
    if (!storeId || !Uuid.safeParse(conversationId).success) return apiError(404, "not_found", "Conversa não encontrada nesta loja.");
    const readSeq = await markConversationRead(storeId, conversationId, body.data.upToSeq);
    return NextResponse.json({ readSeq });
  });
}
