import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { productPath, storePath } from "@/lib/paths";
import { DemoBadge } from "@/components/public/explore/DemoBadge";
import { ExploreLink } from "@/components/public/explore/ExploreLink";
import { InquiryPanel } from "@/components/public/InquiryPanel";
import { ProductShowcase } from "@/components/public/ProductShowcase";
import { getPublicProduct } from "@/modules/products/publication";
import { DEMO_STORE_LABEL, isDemoStore } from "@/modules/stores/demo";

// URLs assinadas das fotos expiram: a página é sempre montada na hora.
export const dynamic = "force-dynamic";

const load = cache((slug: string) => getPublicProduct(slug));

export async function generateMetadata({ params }: PageProps<"/p/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await load(slug);
  if (!product || product.state !== "published") return { title: "巴西卡沙萨", robots: { index: false } };
  const { snapshot } = product;
  return {
    title: { absolute: `${snapshot.name.display} · ${snapshot.category_zh}` },
    description: snapshot.content.tagline_zh,
    robots: { index: false },
  };
}

/**
 * Vitrine pública do produto: lê só a versão publicada apontada pelo link.
 * Não usa sessão; abrir este endereço não concede acesso à gestão. A consulta
 * leva a versão exibida, para que a conversa fique presa ao que o comprador viu.
 */
export default async function PublicProductPage({ params }: PageProps<"/p/[slug]">) {
  const { slug } = await params;
  const product = await load(slug);
  if (!product) notFound();

  const backToStore = product.store && (
    <a
      href={storePath(product.store.slug)}
      className="inline-flex min-h-11 max-w-full items-center gap-1.5 text-sm font-medium text-brand hover:underline"
    >
      <span aria-hidden="true">←</span>
      <span className="shrink-0">返回店铺</span>
      <span lang="pt-BR" className="min-w-0 truncate font-normal text-ink-soft">
        · {product.store.producer}
      </span>
    </a>
  );

  if (product.state === "unavailable") {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-2xl font-semibold text-ink">该产品暂时无法查看</h1>
        <p className="mt-3 text-ink-soft">生产者已将此产品下架。链接会保留，重新上架后可再次访问。</p>
        {backToStore && <p className="mt-6">{backToStore}</p>}
        <div className="mt-10">
          <ExploreLink from={productPath(slug)} />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-2 py-4 sm:px-6 sm:py-8">
      {backToStore && <nav aria-label="店铺" className="flex px-2 pb-2 sm:px-0">{backToStore}</nav>}
      <ProductShowcase
        view={product.view}
        titleAs="h1"
        notice={isDemoStore(product.store?.slug) ? <DemoBadge label={DEMO_STORE_LABEL} className="mb-3" /> : undefined}
        inquiry={{ enabled: true, panel: <InquiryPanel slug={slug} version={product.version} /> }}
      />
      <div className="mt-6">
        <ExploreLink from={productPath(slug)} />
      </div>
    </div>
  );
}
