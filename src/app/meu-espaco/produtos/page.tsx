import type { Metadata } from "next";
import Link from "next/link";
import { countPendingCleanup, listProducts } from "@/modules/products/repository";
import { ProductOrderList } from "@/components/producer/ProductOrderList";
import { getCatalogRevision } from "@/modules/stores/catalog";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Produtos" };

export default async function ProductsPage() {
  const storeId = await findCurrentStoreId();
  const [products, catalogRevision, pendingCleanup] = storeId
    ? await Promise.all([listProducts(storeId), getCatalogRevision(storeId), countPendingCleanup(storeId)])
    : [[], 1, 0];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-snow">Produtos</h1>
          {products.length > 0 && (
            <p className="mt-1 text-sm text-mist">
              {products.length} {products.length === 1 ? "produto" : "produtos"}
            </p>
          )}
        </div>
        {products.length > 0 && (
          <Link
            href="/meu-espaco/produtos/novo"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-strong"
          >
            <span aria-hidden="true">+</span> Novo produto
          </Link>
        )}
      </div>

      {products.length === 0 && pendingCleanup === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-panel/50 px-6 py-12 text-center">
          <p className="font-medium text-snow">Nenhum produto ainda</p>
          <Link
            href="/meu-espaco/produtos/novo"
            className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-brand px-6 font-semibold text-white hover:bg-brand-strong"
          >
            Criar primeiro produto
          </Link>
        </div>
      ) : (
        <ProductOrderList initialProducts={products} initialRevision={catalogRevision} initialPendingCleanup={pendingCleanup} />
      )}
    </div>
  );
}
