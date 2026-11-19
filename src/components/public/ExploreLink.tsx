"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EXPLORE_PATH, exploreHref } from "@/modules/explore/paths";

/** Botão do cabeçalho do comprador que leva ao diretório fictício, com retorno à vitrine atual. */
export function ExploreLink() {
  const pathname = usePathname();
  if (pathname?.startsWith(EXPLORE_PATH)) return null;
  return (
    <Link
      href={exploreHref(pathname ?? undefined)}
      className="rounded-full border border-sand px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-sand focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      探索更多巴西品牌 →
    </Link>
  );
}
