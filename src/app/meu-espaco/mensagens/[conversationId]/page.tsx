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
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <div className="hidden lg:block">
          <h2 className="mb-3 text-lg font-semibold text-snow">Mensagens</h2>
          <ConversationList initial={conversations} selectedId={conversationId} />
        </div>
        <ConversationView key={detail.id} initial={detail} />
      </div>
    </div>
  );
}
