import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { SendRequest } from "@/modules/messaging/schema";
import { getConversationDetail, sendReply } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";
import { Uuid, messagingRoute } from "../../handlers";

/**
 * “Confirmar envio”: publica para o comprador o texto e a tradução revisados.
 * Só aceita a revisão exata que foi traduzida; repetir não duplica o envio.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/conversations/[conversationId]/replies">) {
  return messagingRoute(request, "reply.send", "producer", async () => {
    const { conversationId } = await ctx.params;
    const body = SendRequest.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Pedido de envio inválido.", body.error.issues);
    const storeId = await findCurrentStoreId();
    if (!storeId || !Uuid.safeParse(conversationId).success) return apiError(404, "not_found", "Conversa não encontrada nesta loja.");
    const sent = await sendReply(storeId, conversationId, body.data);
    const conversation = await getConversationDetail(storeId, conversationId);
    return NextResponse.json({ sent, conversation }, { status: sent.created ? 201 : 200 });
  });
}
