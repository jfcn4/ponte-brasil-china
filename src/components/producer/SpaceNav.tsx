"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/client/fetch-json";

const TABS = [
  { href: "/meu-espaco/produtos", label: "Produtos" },
  { href: "/meu-espaco/mensagens", label: "Mensagens" },
  { href: "/meu-espaco/minha-loja", label: "Minha loja" },
];

const POLL_MS = 20_000;

/** Navegação de Meu espaço, com o número de conversas que têm entradas não lidas. */
export function SpaceNav({ unreadInitial = 0 }: { unreadInitial?: number }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(unreadInitial);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await fetchJson<{ unread: number }>("/api/conversations/summary");
      if (active && result.ok) setUnread(result.data.unread);
    };
    void refresh();
    const timer = setInterval(refresh, POLL_MS);
    window.addEventListener("pg:messages-changed", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("pg:messages-changed", refresh);
    };
  }, [pathname]);

  const onMessages = pathname.startsWith("/meu-espaco/mensagens");
  return (
    <>
      <nav aria-label="Meu espaço" className="-mb-px flex gap-1 overflow-x-auto">
        {TABS.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          const badge = tab.href === "/meu-espaco/mensagens" && unread > 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
                active ? "border-coral text-snow" : "border-transparent text-mist hover:text-snow"
              }`}
            >
              {tab.label}
              {badge && (
                <span
                  className="inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-white"
                  aria-label={`${unread} ${unread === 1 ? "conversa com novidades" : "conversas com novidades"}`}
                >
                  {unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {/* Fora de Mensagens, uma consulta nova não pode passar despercebida. */}
      {unread > 0 && !onMessages && (
        <p className="order-last mb-3 flex basis-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-snow">
          <span>
            {unread === 1 ? "Um comprador mandou mensagem nova." : `${unread} conversas têm mensagens novas de compradores.`}
          </span>
          <Link href="/meu-espaco/mensagens" className="font-semibold text-coral underline underline-offset-4">
            Abrir Mensagens →
          </Link>
        </p>
      )}
    </>
  );
}
