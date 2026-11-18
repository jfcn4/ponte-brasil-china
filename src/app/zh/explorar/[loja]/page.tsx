import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoBadge } from "@/components/public/explore/DemoBadge";
import { StoreCatalog } from "@/components/public/StoreCatalog";
import { DEMO_LABEL, DEMO_STORES, demoCatalogView, findDemoStore } from "@/modules/explore/directory";
import { EXPLORE_PATH, demoProductPath } from "@/modules/explore/paths";
import { BackToDirectory } from "@/components/public/explore/BackToDirectory";

export const dynamicParams = false;

export function generateStaticParams() {
  return DEMO_STORES.map((store) => ({ loja: store.slug }));
}

export async function generateMetadata({ params }: PageProps<"/zh/explorar/[loja]">): Promise<Metadata> {
  const store = findDemoStore((await params).loja);
  return { title: { absolute: store ? `${store.name} · ${DEMO_LABEL}` : DEMO_LABEL } };
}

/** Catálogo da loja fictícia, com o mesmo componente do catálogo real. */
export default async function DemoStorePage({ params }: PageProps<"/zh/explorar/[loja]">) {
  const store = findDemoStore((await params).loja);
  if (!store) notFound();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <BackToDirectory />
      <StoreCatalog
        view={demoCatalogView(store)}
        productHref={(slug) => demoProductPath(store.slug, slug)}
        inquiry={false}
        notice={<DemoBadge className="mb-3" />}
      />
      <p className="mt-8 text-center">
        <a href={EXPLORE_PATH} className="inline-flex min-h-11 items-center text-sm text-ink-soft hover:text-brand hover:underline">
          查看全部示例店铺
        </a>
      </p>
    </div>
  );
}
