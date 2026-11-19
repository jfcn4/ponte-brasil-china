import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { DemoBadge } from "@/components/public/explore/DemoBadge";
import { ExploreLink } from "@/components/public/explore/ExploreLink";
import { StoreCatalog } from "@/components/public/StoreCatalog";
import { storePath } from "@/lib/paths";
import { getPublicCatalog } from "@/modules/stores/catalog";
import { DEMO_STORE_LABEL, isDemoStore } from "@/modules/stores/demo";

// URLs assinadas das fotos expiram e a ordem muda no painel: sempre montada na hora.
export const dynamic = "force-dynamic";

const load = cache((slug: string) => getPublicCatalog(slug));

export async function generateMetadata({ params }: PageProps<"/l/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const catalog = await load(slug);
  if (!catalog) return { title: "巴西卡沙萨", robots: { index: false } };
  return {
    title: { absolute: `${catalog.producer} · 巴西卡沙萨` },
    description: catalog.intro ?? undefined,
    robots: { index: false },
  };
}

/**
 * Catálogo público da loja (QR da loja). Sem sessão: só produtos publicados,
 * na ordem salva no painel, cada um levando à sua vitrine individual.
 */
export default async function PublicStorePage({ params }: PageProps<"/l/[slug]">) {
  const { slug } = await params;
  const catalog = await load(slug);
  if (!catalog) notFound();
  return (
    <>
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <StoreCatalog view={catalog} notice={isDemoStore(slug) ? <DemoBadge label={DEMO_STORE_LABEL} className="mb-3" /> : undefined} />
      </div>
      <ExploreLink from={storePath(slug)} />
    </>
  );
}
