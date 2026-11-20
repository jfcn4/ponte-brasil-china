import type { Metadata } from "next";
import { ConversationList } from "@/components/producer/messages/ConversationList";
import { MessagesIdlePanel } from "@/components/producer/messages/MessagesIdlePanel";
import { listConversations } from "@/modules/messaging/service";
import { getStoreOverview } from "@/modules/stores/catalog";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Mensagens" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const storeId = await findCurrentStoreId();
  const conversations = storeId ? await listConversations(storeId) : [];
  const unread = conversations.filter((c) => c.hasUnread).length;
  const pending = conversations
    .filter((c) => c.awaitingReply)
    .sort((a, b) => a.lastMessageAt.localeCompare(b.lastMessageAt));
  const storeUrl =
    storeId && conversations.length === 0 ? ((await getStoreOverview(storeId).catch(() => null))?.public?.url ?? null) : null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-x-6">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <h1 className="text-xl font-semibold tracking-tight text-snow">Mensagens</h1>
          <p className="mb-3 mt-0.5 text-xs text-mist">
            {conversations.length === 0
              ? "Consultas de compradores sobre seus produtos publicados."
              : `${conversations.length} ${conversations.length === 1 ? "conversa" : "conversas"} · ${unread} ${unread > 1 ? "não lidas" : "não lida"}`}
          </p>
        </div>
        <div className="mb-5 min-w-0 lg:col-start-2 lg:row-start-2 lg:mb-0">
          <MessagesIdlePanel
            total={conversations.length}
            pendingCount={pending.length}
            nextPendingId={pending[0]?.id ?? null}
            storeUrl={storeUrl}
          />
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <ConversationList initial={conversations} selectedId={null} compact={conversations.length > 0} hideWhenEmpty />
        </div>
      </div>
    </div>
  );
}
