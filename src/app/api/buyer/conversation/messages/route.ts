import { after, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { BUYER_TOKEN_HEADER, BuyerMessageRequest, BuyerToken } from "@/modules/messaging/schema";
import { addBuyerMessage, getBuyerConversation, interpretMessage } from "@/modules/messaging/service";
import { messagingRoute } from "../../../conversations/handlers";

export const maxDuration = 60;

/** Nova entrada do comprador na própria conversa. Idempotente pela chave do envio. */
export async function POST(request: Request) {
  return messagingRoute(request, "buyer.message", "buyer", async () => {
    const token = BuyerToken.safeParse(request.headers.get(BUYER_TOKEN_HEADER));
    if (!token.success) return apiError(404, "not_found", "未找到该对话，请确认私密链接是否完整。");
    const body = BuyerMessageRequest.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "请填写留言内容（最多 2000 字）。", body.error.issues);
    const added = await addBuyerMessage(token.data, body.data);
    if (added.created) after(() => interpretMessage(added.storeId, added.messageId).then(() => undefined));
    const conversation = await getBuyerConversation(token.data);
    return NextResponse.json({ conversation }, { status: added.created ? 201 : 200, headers: { "cache-control": "no-store" } });
  });
}
