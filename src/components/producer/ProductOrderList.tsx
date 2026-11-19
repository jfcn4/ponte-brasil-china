"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/client/fetch-json";
import { productPath } from "@/lib/paths";
import type { ProductListItem } from "@/modules/products/repository";
import { featuredProductId, moveInOrder } from "@/modules/stores/catalog-view";
import { StatusLabel } from "./StatusLabel";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

type OrderResponse = { catalogRevision: number; products: ProductListItem[] };
type Direction = "up" | "down";

function label(product: ProductListItem) {
  return product.name ?? "produto sem nome";
}

function featuredOf(products: ProductListItem[]) {
  return featuredProductId(products.map((p) => ({ id: p.id, isPublic: p.publicSlug !== null })));
}

/**
 * Lista de produtos do painel, na ordem do catálogo da loja. "Mover para
 * cima/baixo" grava a ordem na hora (teclado e toque, sem arrastar). O
 * primeiro produto publicado é o destaque da loja; rascunhos ficam na lista,
 * mas não aparecem no catálogo público.
 */
export function ProductOrderList({
  initialProducts,
  initialRevision,
}: {
  initialProducts: ProductListItem[];
  initialRevision: number;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [revision, setRevision] = useState(initialRevision);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const savingRef = useRef(false);
  const focusAfter = useRef<{ id: string; direction: Direction } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  // Mantém o foco no item movido; no topo/fim, passa para o botão ainda ativo.
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const index = products.findIndex((p) => p.id === target.id);
    const blocked = target.direction === "up" ? index === 0 : index === products.length - 1;
    const direction = blocked ? (target.direction === "up" ? "down" : "up") : target.direction;
    buttons.current.get(`${target.id}:${direction}`)?.focus();
  }, [products]);

  const featured = featuredOf(products);

  const move = async (product: ProductListItem, direction: Direction) => {
    if (savingRef.current) return;
    const nextIds = moveInOrder(
      products.map((p) => p.id),
      product.id,
      direction,
    );
    if (!nextIds) return;
    const previous = products;
    const byId = new Map(products.map((p) => [p.id, p]));
    const next = nextIds.map((id) => byId.get(id)!);

    savingRef.current = true;
    setSaving(true);
    focusAfter.current = { id: product.id, direction };
    setProducts(next);
    setStatus({ tone: "info", text: "Salvando a ordem…" });

    const result = await fetchJson<OrderResponse>(
      "/api/stores/catalog/order",
      { method: "PUT", json: { productIds: nextIds, expectedRevision: revision } },
      "Sem conexão. A ordem anterior foi mantida; tente de novo.",
    );

    if (result.ok) {
      const position = result.data.products.findIndex((p) => p.id === product.id) + 1;
      const newFeatured = result.data.products.find((p) => p.id === featuredOf(result.data.products));
      setProducts(result.data.products);
      setRevision(result.data.catalogRevision);
      setStatus({
        tone: "info",
        text:
          `Ordem salva. ${label(product)} está na posição ${position} de ${result.data.products.length}.` +
          (newFeatured ? ` Destaque da loja: ${label(newFeatured)}.` : ""),
      });
    } else if (result.status === 409) {
      // Outra aba mudou a ordem ou a lista: mostra o que está gravado.
      const current = await fetchJson<OrderResponse>("/api/stores/catalog/order");
      if (current.ok) {
        setProducts(current.data.products);
        setRevision(current.data.catalogRevision);
      } else {
        setProducts(previous);
      }
      setStatus({ tone: "error", text: `${result.message} Confira a ordem e mova de novo se precisar.` });
    } else {
      setProducts(previous);
      setStatus({ tone: "error", text: result.message });
    }
    savingRef.current = false;
    setSaving(false);
  };

  return (
    <>
      <p className="mt-6 text-sm text-mist">
        A ordem abaixo é a do catálogo da loja. O primeiro produto publicado fica em destaque; rascunhos não aparecem
        para o comprador. Links e QRs não mudam ao reordenar.
      </p>
      <p role="status" aria-live="polite" className={`mt-2 min-h-5 text-sm ${status?.tone === "error" ? "text-coral" : "text-ok"}`}>
        {status?.text ?? ""}
      </p>
      <ol className="mt-2 space-y-3" aria-label="Produtos da loja, na ordem do catálogo">
        {products.map((product, index) => (
          <li
            key={product.id}
            className={`flex flex-col gap-3 rounded-xl border bg-panel p-3 sm:p-4 lg:flex-row lg:items-center lg:gap-4 ${
              product.id === featured ? "border-coral/60" : "border-line"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-panel-2 sm:h-24 sm:w-24">
                {product.thumbnailUrl ? (
                  // URLs assinadas e temporárias do bucket privado: sem otimização do next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.thumbnailUrl} alt={`Foto principal de ${label(product)}`} className="h-full w-full object-contain" />
                ) : (
                  <span className="px-2 text-center text-xs text-mist">Sem foto</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 break-words font-semibold text-snow">
                  {product.name ?? <span className="italic text-mist">Sem nome</span>}
                </p>
                <StatusLabel status={product.status} className="mt-0.5" />
                {product.id === featured && <p className="text-sm font-medium text-coral">Destaque da loja</p>}
                <p className="mt-1 text-xs text-mist">Alterado em {dateFormat.format(new Date(product.updatedAt))}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
              <div role="group" aria-label={`Ordem de ${label(product)}`} className="flex gap-2">
                {(["up", "down"] as const).map((direction) => {
                  const disabled = saving || (direction === "up" ? index === 0 : index === products.length - 1);
                  return (
                    <button
                      key={direction}
                      ref={(el) => {
                        if (el) buttons.current.set(`${product.id}:${direction}`, el);
                        else buttons.current.delete(`${product.id}:${direction}`);
                      }}
                      type="button"
                      onClick={() => void move(product, direction)}
                      aria-disabled={disabled}
                      aria-label={`${direction === "up" ? "Mover para cima" : "Mover para baixo"}: ${label(product)}`}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-line px-3 text-sm font-medium text-snow hover:border-coral aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:border-line"
                    >
                      <span aria-hidden="true">{direction === "up" ? "↑" : "↓"}</span>
                      <span className="hidden sm:inline">{direction === "up" ? "Mover para cima" : "Mover para baixo"}</span>
                    </button>
                  );
                })}
              </div>
              <Link
                href={`/meu-espaco/produtos/${product.id}`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral"
                aria-label={`Editar ${label(product)}`}
              >
                Editar
              </Link>
              <Link
                href={`/meu-espaco/produtos/${product.id}/apresentacao`}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral"
                aria-label={`Apresentação em chinês de ${label(product)}`}
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
                    aria-label={`Visualizar a vitrine de ${label(product)} (nova aba)`}
                  >
                    Visualizar
                  </a>
                  <Link
                    href={`/meu-espaco/produtos/${product.id}/apresentacao#compartilhar`}
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral"
                    aria-label={`Link e QR de ${label(product)}`}
                  >
                    Link e QR
                  </Link>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}
