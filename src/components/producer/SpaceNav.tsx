"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/meu-espaco/produtos", label: "Produtos" },
  { href: "/meu-espaco/mensagens", label: "Mensagens" },
  { href: "/meu-espaco/minha-loja", label: "Minha loja" },
];

export function SpaceNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Meu espaço" className="-mb-px flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              active ? "border-coral text-snow" : "border-transparent text-mist hover:text-snow"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
