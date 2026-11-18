import { NextResponse } from "next/server";
import { countUnreadConversations } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";
import { messagingRoute } from "../handlers";

/** Número de conversas com entradas ainda não exibidas ao produtor (badge de Mensagens). */
export async function GET(request: Request) {
  return messagingRoute(
    request,
    "conversations.summary",
    "producer",
    async () => {
      const storeId = await findCurrentStoreId();
      const unread = storeId ? await countUnreadConversations(storeId) : 0;
      return NextResponse.json({ unread }, { headers: { "cache-control": "no-store" } });
    },
    { mutation: false },
  );
}
