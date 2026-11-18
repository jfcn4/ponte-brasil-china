import type { Metadata } from "next";
import Link from "next/link";
import { listProducts } from "@/modules/products/repository";
import { StatusBadge } from "@/components/producer/StatusBadge";
import { productPath } from "@/lib/public-url";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Produtos" };

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export default async function ProductsPage() {
  const storeId = await findCurrentStoreId();
  const products = storeId ? await listProducts(storeId) : [];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-snow">Produtos</h1>
          <p className="mt-1 text-sm text-mist">
            {products.length === 0
              ? "Cadastre sua primeira cachaça para começar."
              : `${products.length} ${products.length === 1 ? "produto" : "produtos"} nesta loja`}
          </p>
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

      {products.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-line bg-panel/50 px-6 py-12 text-center">
          <p className="font-medium text-snow">Nenhum produto ainda</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-mist">
            Descreva sua cachaça em português e adicione até três fotos reais. O rascunho fica salvo enquanto você preenche.
          </p>
          <Link
            href="/meu-espaco/produtos/novo"
            className="mt-6 inline-flex min-h-12 items-center rounded-lg bg-brand px-6 font-semibold text-white hover:bg-brand-strong"
          >
            Criar primeiro produto
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3" aria-label="Produtos da loja">
          {products.map((product) => (
            <li
              key={product.id}
              className="flex items-center gap-4 rounded-xl border border-line bg-panel p-3 sm:p-4"
            >
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-panel-2 sm:h-24 sm:w-24">
                {product.thumbnailUrl ? (
                  // URLs assinadas e temporárias do bucket privado: sem otimização do next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.thumbnailUrl}
                    alt={`Foto principal de ${product.name ?? "produto sem nome"}`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="px-2 text-center text-xs text-mist">Sem foto</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words font-semibold text-snow">
                  {product.name ?? <span className="italic text-mist">Sem nome</span>}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <StatusBadge status={product.status} />
                  {product.publishedVersion !== null && (
                    <span className="text-mist">versão {product.publishedVersion} no ar</span>
                  )}
                  <span className="text-mist">
                    {product.imageCount} de 3 fotos · atualizado {dateFormat.format(new Date(product.updatedAt))}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Link
                  href={`/meu-espaco/produtos/${product.id}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral"
                  aria-label={`Editar ${product.name ?? "produto sem nome"}`}
                >
                  Editar
                </Link>
                <Link
                  href={`/meu-espaco/produtos/${product.id}/apresentacao`}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral"
                  aria-label={`Apresentação em chinês de ${product.name ?? "produto sem nome"}`}
                >
                  Apresentação
                </Link>
                {product.publicSlug && (
                  <>
                    <a
                      href={productPath(product.publicSlug)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral"
                      aria-label={`Visualizar a vitrine de ${product.name ?? "produto sem nome"} (nova aba)`}
                    >
                      Visualizar
                    </a>
                    <Link
                      href={`/meu-espaco/produtos/${product.id}/apresentacao#compartilhar`}
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral"
                      aria-label={`Link e QR de ${product.name ?? "produto sem nome"}`}
                    >
                      Link e QR
                    </Link>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
