import { NextResponse } from "next/server";
import { countUnreadConversations, listConversations } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";
import { messagingRoute } from "./handlers";

/** Conversas da loja desta sessão, mais recentes primeiro. */
export async function GET(request: Request) {
  return messagingRoute(
    request,
    "conversations.list",
    "producer",
    async () => {
      const storeId = await findCurrentStoreId();
      if (!storeId) return NextResponse.json({ conversations: [], unread: 0 }, { headers: { "cache-control": "no-store" } });
      const [conversations, unread] = await Promise.all([listConversations(storeId), countUnreadConversations(storeId)]);
      return NextResponse.json({ conversations, unread }, { headers: { "cache-control": "no-store" } });
    },
    { mutation: false },
  );
}
