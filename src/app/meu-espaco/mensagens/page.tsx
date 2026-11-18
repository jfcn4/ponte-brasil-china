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
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-snow">Mensagens</h1>
      <p className="mt-1 text-sm text-mist">
        {conversations.length === 0
          ? "Consultas de compradores sobre seus produtos publicados."
          : `${conversations.length} ${conversations.length === 1 ? "conversa" : "conversas"} · ${unread} com novidades`}
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <ConversationList initial={conversations} selectedId={null} />
        {conversations.length > 0 && (
          <div className="hidden rounded-xl border border-dashed border-line p-8 text-center text-sm text-mist lg:block">
            Escolha uma conversa para ler a tradução e responder.
          </div>
        )}
      </div>
    </div>
  );
}
