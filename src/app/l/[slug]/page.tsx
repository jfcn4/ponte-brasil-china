import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { StoreCatalog } from "@/components/public/StoreCatalog";
import { getPublicCatalog } from "@/modules/stores/catalog";

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
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <StoreCatalog view={catalog} />
    </div>
  );
}
