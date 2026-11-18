import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ConversationList } from "@/components/producer/messages/ConversationList";
import { ConversationView } from "@/components/producer/messages/ConversationView";
import { getConversationDetail, listConversations } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Conversa" };
export const dynamic = "force-dynamic";

/** Conversa aberta: lista ao lado no desktop; só a conversa no celular. */
export default async function ConversationPage({ params }: PageProps<"/meu-espaco/mensagens/[conversationId]">) {
  const { conversationId } = await params;
  if (!z.uuid().safeParse(conversationId).success) notFound();
  const storeId = await findCurrentStoreId();
  if (!storeId) notFound();
  const [detail, conversations] = await Promise.all([
    getConversationDetail(storeId, conversationId),
    listConversations(storeId),
  ]);
  if (!detail) notFound();

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside aria-labelledby="conversations-heading" className="hidden lg:block">
          <div className="lg:sticky lg:top-4">
            <h2 id="conversations-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-mist">
              Conversas
            </h2>
            <ConversationList initial={conversations} selectedId={conversationId} compact />
          </div>
        </aside>
        <ConversationView key={detail.id} initial={detail} />
      </div>
    </div>
  );
}
