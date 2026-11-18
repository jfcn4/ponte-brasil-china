import type { Metadata } from "next";
import { ConversationList } from "@/components/producer/messages/ConversationList";
import { listConversations } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Mensagens" };
export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const storeId = await findCurrentStoreId();
  const conversations = storeId ? await listConversations(storeId) : [];
  const unread = conversations.filter((c) => c.hasUnread).length;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-snow">Mensagens</h1>
          <p className="mb-3 mt-0.5 text-xs text-mist">
            {conversations.length === 0
              ? "Consultas de compradores sobre seus produtos publicados."
              : `${conversations.length} ${conversations.length === 1 ? "conversa" : "conversas"} · ${unread} com novidades`}
          </p>
          <ConversationList initial={conversations} selectedId={null} compact={conversations.length > 0} />
        </div>
        {conversations.length > 0 && (
          <div className="hidden items-center justify-center rounded-xl border border-dashed border-line p-8 text-center text-sm text-mist lg:flex">
            Escolha uma conversa para ler a tradução e responder.
          </div>
        )}
      </div>
    </div>
  );
}
