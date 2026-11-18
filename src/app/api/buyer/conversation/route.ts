import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { BUYER_TOKEN_HEADER, BuyerToken } from "@/modules/messaging/schema";
import { getBuyerConversation } from "@/modules/messaging/service";
import { messagingRoute } from "../../conversations/handlers";

/** Conversa do comprador pelo segredo do link privado (enviado em cabeçalho, nunca na URL). */
export async function GET(request: Request) {
  return messagingRoute(
    request,
    "buyer.conversation",
    "buyer",
    async () => {
      const token = BuyerToken.safeParse(request.headers.get(BUYER_TOKEN_HEADER));
      if (!token.success) return apiError(404, "not_found", "未找到该对话，请确认私密链接是否完整。");
      const conversation = await getBuyerConversation(token.data);
      if (!conversation) return apiError(404, "not_found", "未找到该对话，请确认私密链接是否完整。");
      return NextResponse.json({ conversation }, { headers: { "cache-control": "no-store" } });
    },
    { mutation: false },
  );
}
