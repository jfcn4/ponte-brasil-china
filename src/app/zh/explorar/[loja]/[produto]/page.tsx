import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DemoBadge } from "@/components/public/explore/DemoBadge";
import { ProductShowcase } from "@/components/public/ProductShowcase";
import { DEMO_INQUIRY_UNAVAILABLE, DEMO_LABEL, DEMO_STORES, demoShowcaseView, findDemoProduct } from "@/modules/explore/directory";
import { demoStorePath } from "@/modules/explore/paths";
import { BackToDirectory } from "@/components/public/explore/BackToDirectory";

export const dynamicParams = false;

export function generateStaticParams() {
  return DEMO_STORES.flatMap((store) => store.products.map((product) => ({ loja: store.slug, produto: product.slug })));
}

export async function generateMetadata({ params }: PageProps<"/zh/explorar/[loja]/[produto]">): Promise<Metadata> {
  const { loja, produto } = await params;
  const found = findDemoProduct(loja, produto);
  return { title: { absolute: found ? `${found.product.nameZh} · ${DEMO_LABEL}` : DEMO_LABEL } };
}

/**
 * Ficha do produto fictício, com o mesmo componente da vitrine real. A
 * consulta comercial fica indisponível: nenhuma conversa é criada aqui.
 */
export default async function DemoProductPage({ params }: PageProps<"/zh/explorar/[loja]/[produto]">) {
  const { loja, produto } = await params;
  const found = findDemoProduct(loja, produto);
  if (!found) notFound();
  const { store, product } = found;
  return (
    <div className="mx-auto w-full max-w-3xl px-2 py-4 sm:px-6 sm:py-8">
      <div className="px-2 sm:px-0">
        <BackToDirectory store={{ href: demoStorePath(store.slug), name: store.name }} />
      </div>
      <ProductShowcase
        view={demoShowcaseView(store, product)}
        titleAs="h1"
        notice={<DemoBadge className="mb-3" />}
        inquiry={{ enabled: false, reason: DEMO_INQUIRY_UNAVAILABLE, reasonLang: "zh-Hans" }}
      />
    </div>
  );
}
