"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/client/fetch-json";
import type { ConversationListItem } from "@/modules/messaging/schema";

const POLL_MS = 15_000;

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/**
 * Estado da conversa em texto simples: “Nova” (não lida) é distinto de “Aguardando resposta”.
 * Pendente ganha peso tipográfico; “Respondida” é informação secundária.
 */
export function ConversationStatus({ item }: { item: Pick<ConversationListItem, "hasUnread" | "awaitingReply"> }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-sm">
      {item.hasUnread && <span className="font-semibold text-coral">Nova</span>}
      {item.hasUnread && <span aria-hidden="true" className="text-mist">·</span>}
      {item.awaitingReply ? (
        <span className="font-semibold text-warn">Aguardando resposta</span>
      ) : (
        <span className="text-xs text-mist">Respondida</span>
      )}
    </span>
  );
}

/** Lista de conversas da loja, atualizada periodicamente. */
export function ConversationList({
  initial,
  selectedId,
  compact = false,
  hideWhenEmpty = false,
}: {
  initial: ConversationListItem[];
  selectedId: string | null;
  /** Coluna lateral estreita: prévia em uma linha. */
  compact?: boolean;
  /** Sem conversas, não mostra o quadro vazio (a página oferece o próprio). */
  hideWhenEmpty?: boolean;
}) {
  const [items, setItems] = useState(initial);

  useEffect(() => {
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await fetchJson<{ conversations: ConversationListItem[] }>("/api/conversations");
      if (result.ok) setItems(result.data.conversations);
    };
    const timer = setInterval(refresh, POLL_MS);
    window.addEventListener("pg:messages-changed", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pg:messages-changed", refresh);
    };
  }, []);

  if (items.length === 0) {
    if (hideWhenEmpty) return null;
    return (
      <div className="rounded-xl border border-dashed border-line bg-panel/50 p-8 text-center">
        <p className="font-medium text-snow">Nenhuma conversa ainda</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-mist">As consultas dos compradores chegam aqui.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Conversas">
      {items.map((item) => {
        const selected = item.id === selectedId;
        return (
          <li key={item.id}>
            <Link
              href={`/meu-espaco/mensagens/${item.id}`}
              aria-current={selected ? "page" : undefined}
              className={`block rounded-xl border p-3 transition-colors ${
                selected ? "border-coral bg-panel-2" : "border-line bg-panel hover:border-mist"
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span lang="zh-Hans" className="block truncate font-semibold text-snow">
                    {item.productTitle}
                  </span>
                  <span className="block truncate text-xs text-mist">
                    {item.productName} · {item.buyerLabel}
                  </span>
                </span>
                <time dateTime={item.lastMessageAt} className="shrink-0 text-xs text-mist">
                  {dateFormat.format(new Date(item.lastMessageAt))}
                </time>
              </span>
              <span lang={item.previewLang} className={`mt-1.5 block text-sm text-snow/90 ${compact ? "truncate" : "line-clamp-2"}`}>
                {item.lastAuthor === "producer" ? "Você: " : ""}
                {item.preview}
              </span>
              <span className="mt-2 block">
                <ConversationStatus item={item} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
