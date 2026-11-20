"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/client/fetch-json";
import { productPath } from "@/lib/paths";
import type { ProductListItem } from "@/modules/products/repository";
import { featuredProductId } from "@/modules/stores/catalog-view";
import { formatBrl } from "@/modules/products/pricing";
import {
  DeleteProductDialog,
  type DeletionOutcome,
} from "./DeleteProductDialog";
import { ProductActionsMenu } from "./ProductActionsMenu";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

type OrderResponse = { catalogRevision: number; products: ProductListItem[] };
type Tab = "published" | "drafts";

/** Publicados: no ar (inclui “alterações pendentes”). Rascunhos: o restante. */
function isLive(p: ProductListItem) {
  return p.status === "published" || p.status === "pending";
}

function label(product: ProductListItem) {
  return product.name ?? "produto sem nome";
}

function featuredOf(products: ProductListItem[]) {
  return featuredProductId(
    products.map((p) => ({ id: p.id, isPublic: p.publicSlug !== null })),
  );
}

/**
 * Lista de produtos do painel, na ordem do catálogo da loja. A alça de seis
 * pontos reordena por arraste (mouse e toque) ou pelo teclado (Espaço pega e
 * solta, setas movem, Esc cancela); a ordem é gravada ao soltar. O
 * primeiro produto publicado é o destaque da loja; rascunhos ficam na lista,
 * mas não aparecem no catálogo público.
 */
export function ProductOrderList({
  initialProducts,
  initialRevision,
  initialPendingCleanup = 0,
}: {
  initialProducts: ProductListItem[];
  initialRevision: number;
  initialPendingCleanup?: number;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [revision, setRevision] = useState(initialRevision);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Tab>(() =>
    initialProducts.some(isLive) || initialProducts.length === 0
      ? "published"
      : "drafts",
  );
  const [status, setStatus] = useState<{
    tone: "info" | "error";
    text: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null);
  const [pendingCleanup, setPendingCleanup] = useState(initialPendingCleanup);
  const [cleaning, setCleaning] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const savingRef = useRef(false);
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const rows = useRef(new Map<string, HTMLLIElement>());
  const focusAfter = useRef<string | null>(null);
  // Arraste com mouse/toque: item pego e posição de soltura (índice entre os demais).
  const [drag, setDrag] = useState<{
    id: string;
    dropIndex: number;
    startY: number;
    offsetY: number;
  } | null>(null);
  // Teclado: item pego e ordem provisória dos publicados (ainda não gravada).
  const [grab, setGrab] = useState<{
    id: string;
    ids: string[];
    original: string[];
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  // Reordenar o DOM pode tirar o foco: devolve-o à alça do item movido.
  useEffect(() => {
    const id = focusAfter.current;
    if (!id) return;
    focusAfter.current = null;
    handles.current.get(id)?.focus();
  }, [products, grab]);

  const listRef = useRef<HTMLOListElement | null>(null);
  const tops = useRef(new Map<string, number>());
  const orderKey = (
    tab === "published"
      ? (grab?.ids ?? products.filter(isLive).map((p) => p.id))
      : products.filter((p) => !isLive(p)).map((p) => p.id)
  ).join();
  // Animação simples: ao mudar a ordem, cada item desliza do lugar antigo ao novo.
  useLayoutEffect(() => {
    const base = listRef.current?.getBoundingClientRect().top ?? 0;
    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const next = new Map<string, number>();
    rows.current.forEach((el, id) => {
      const top = el.getBoundingClientRect().top - base;
      next.set(id, top);
      const before = tops.current.get(id);
      if (!reduce && before !== undefined && Math.abs(before - top) > 1) {
        el.animate(
          [
            { transform: `translateY(${before - top}px)` },
            { transform: "none" },
          ],
          { duration: 180, easing: "ease-out" },
        );
      }
    });
    tops.current = next;
  }, [orderKey, tab]);

  const featured = featuredOf(products);
  const published = products.filter(isLive);
  const drafts = products.filter((p) => !isLive(p));
  const byId = new Map(products.map((p) => [p.id, p]));
  const shownPublished = grab
    ? grab.ids.map((id) => byId.get(id)!).filter(Boolean)
    : published;
  const visible = tab === "published" ? shownPublished : drafts;

  /** Grava a ordem dos publicados; em falha, restaura a última ordem salva. */
  const persist = async (liveIds: string[], moved: ProductListItem) => {
    if (savingRef.current) return;
    if (liveIds.join() === published.map((p) => p.id).join()) {
      setAnnouncement(`${label(moved)} continua na mesma posição.`);
      return;
    }
    // Rascunhos mantêm o próprio lugar; só os publicados trocam entre si.
    let cursor = 0;
    const nextIds = products.map((p) =>
      isLive(p) ? liveIds[cursor++]! : p.id,
    );
    const previous = products;
    const next = nextIds.map((id) => byId.get(id)!);

    savingRef.current = true;
    setSaving(true);
    focusAfter.current = moved.id;
    setProducts(next);
    setStatus({ tone: "info", text: "Salvando a ordem…" });

    const result = await fetchJson<OrderResponse>(
      "/api/stores/catalog/order",
      {
        method: "PUT",
        json: { productIds: nextIds, expectedRevision: revision },
      },
      "Sem conexão.",
    );

    if (result.ok) {
      const livePublished = result.data.products.filter(isLive);
      const position = livePublished.findIndex((p) => p.id === moved.id) + 1;
      const newFeatured = result.data.products.find(
        (p) => p.id === featuredOf(result.data.products),
      );
      setProducts(result.data.products);
      setRevision(result.data.catalogRevision);
      const text =
        `Ordem salva. ${label(moved)} está na posição ${position} de ${livePublished.length}.` +
        (newFeatured ? ` Destaque da loja: ${label(newFeatured)}.` : "");
      setStatus({ tone: "info", text });
      setAnnouncement(text);
    } else if (result.status === 409) {
      // Outra aba mudou a ordem ou a lista: mostra o que está gravado.
      const current = await fetchJson<OrderResponse>(
        "/api/stores/catalog/order",
      );
      if (current.ok) {
        setProducts(current.data.products);
        setRevision(current.data.catalogRevision);
      } else {
        setProducts(previous);
      }
      const text = `${result.message} Confira a ordem e tente de novo se precisar.`;
      setStatus({ tone: "error", text });
      setAnnouncement(text);
    } else {
      setProducts(previous);
      const text = `Não foi possível salvar a ordem; a última ordem salva foi restaurada. ${result.message} Você pode tentar de novo.`;
      setStatus({ tone: "error", text });
      setAnnouncement(text);
    }
    savingRef.current = false;
    setSaving(false);
  };

  /** Depois da exclusão: lista, destaque, contadores e páginas do servidor se realinham. */
  const onDeleted = (outcome: DeletionOutcome, name: string) => {
    const remaining = outcome.products;
    const newFeatured = remaining.find((p) => p.id === featuredOf(remaining));
    const { conversationCount, pendingCleanup: pending } = outcome.deleted;
    setDeleting(null);
    setProducts(remaining);
    setRevision(outcome.catalogRevision);
    setPendingCleanup(pending);
    const text =
      `Produto “${name}” excluído definitivamente` +
      (conversationCount > 0
        ? `, com ${conversationCount} ${conversationCount === 1 ? "conversa" : "conversas"}.`
        : ".") +
      (newFeatured ? ` Destaque da loja: ${newFeatured.name ?? "produto sem nome"}.` : "");
    setStatus({ tone: "info", text });
    setAnnouncement(text);
    // O foco precisa ficar na lista (o item que o tinha saiu da tela).
    requestAnimationFrame(() => panel.current?.focus());
    // Contagem do cabeçalho, Mensagens e selo de conversas novas.
    router.refresh();
    window.dispatchEvent(new Event("pg:messages-changed"));
  };

  const retryCleanup = async () => {
    setCleaning(true);
    const result = await fetchJson<{ pendingCleanup: number }>(
      "/api/stores/storage-cleanup",
      { method: "POST" },
      "Sem conexão.",
    );
    setCleaning(false);
    if (result.ok) {
      setPendingCleanup(result.data.pendingCleanup);
      setStatus(
        result.data.pendingCleanup === 0
          ? { tone: "info", text: "Fotos dos produtos excluídos removidas do armazenamento." }
          : { tone: "error", text: "O armazenamento ainda não aceitou a remoção das fotos. Tente de novo em instantes." },
      );
    } else {
      setStatus({ tone: "error", text: `Não foi possível limpar as fotos. ${result.message}` });
    }
  };

  // ---- Arraste (mouse e toque): só a alça captura o gesto ----
  const dropIndexAt = (id: string, clientY: number) => {
    let index = 0;
    for (const p of published) {
      if (p.id === id) continue;
      const rect = rows.current.get(p.id)?.getBoundingClientRect();
      if (rect && clientY > rect.top + rect.height / 2) index++;
    }
    return index;
  };
  const onHandlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    product: ProductListItem,
  ) => {
    if (saving || grab || (event.pointerType === "mouse" && event.button !== 0))
      return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      id: product.id,
      dropIndex: dropIndexAt(product.id, event.clientY),
      startY: event.clientY,
      offsetY: 0,
    });
    setAnnouncement("");
  };
  const onHandlePointerMove = (
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!drag) return;
    setDrag({
      ...drag,
      dropIndex: dropIndexAt(drag.id, event.clientY),
      offsetY: event.clientY - drag.startY,
    });
  };
  const finishDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    product: ProductListItem,
    cancel: boolean,
  ) => {
    if (!drag) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    const { dropIndex } = drag;
    setDrag(null);
    if (cancel) return;
    const others = published.map((p) => p.id).filter((id) => id !== product.id);
    others.splice(dropIndex, 0, product.id);
    void persist(others, product);
  };

  // ---- Teclado: Espaço pega/solta, setas movem, Esc cancela ----
  const positionText = (ids: string[], id: string) =>
    `posição ${ids.indexOf(id) + 1} de ${ids.length}`;
  const onHandleKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    product: ProductListItem,
  ) => {
    if (saving) return;
    const key = event.key;
    if (key === " " || key === "Spacebar") {
      event.preventDefault();
      if (!grab) {
        const ids = published.map((p) => p.id);
        setGrab({ id: product.id, ids, original: ids });
        setAnnouncement(
          `${label(product)} pego, ${positionText(ids, product.id)}. Use as setas para mover, Espaço para soltar e salvar, Esc para cancelar.`,
        );
      } else {
        const ids = grab.ids;
        setGrab(null);
        focusAfter.current = product.id;
        setAnnouncement(
          `${label(product)} solto, ${positionText(ids, product.id)}.`,
        );
        void persist(ids, product);
      }
      return;
    }
    if (!grab) return;
    if (key === "Escape") {
      event.preventDefault();
      focusAfter.current = product.id;
      setGrab(null);
      setAnnouncement(
        `Movimento cancelado. ${label(product)} voltou à ${positionText(grab.original, product.id)}.`,
      );
      return;
    }
    const delta =
      key === "ArrowUp" || key === "ArrowLeft"
        ? -1
        : key === "ArrowDown" || key === "ArrowRight"
          ? 1
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    const index = grab.ids.indexOf(product.id);
    const target = index + delta;
    if (target < 0 || target >= grab.ids.length) {
      setAnnouncement(
        target < 0 ? "Já é o primeiro da lista." : "Já é o último da lista.",
      );
      return;
    }
    const ids = [...grab.ids];
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    focusAfter.current = product.id;
    setGrab({ ...grab, ids });
    setAnnouncement(
      `${label(product)}, ${positionText(ids, product.id)}.` +
        (target === 0 ? " Será o destaque da loja." : ""),
    );
  };

  const tabs: Array<{ id: Tab; text: string; count: number }> = [
    { id: "published", text: "Publicados", count: published.length },
    { id: "drafts", text: "Rascunhos", count: drafts.length },
  ];
  const onTabKey = (event: React.KeyboardEvent, current: Tab) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next: Tab = current === "published" ? "drafts" : "published";
    setTab(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="Produtos da loja"
        className="mt-6 flex gap-6 border-b border-line"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            type="button"
            aria-selected={tab === t.id}
            aria-controls="painel-produtos"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, t.id)}
            className={`-mb-px min-h-11 border-b-2 px-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-coral ${
              tab === t.id
                ? "border-coral text-snow"
                : "border-transparent text-mist hover:text-snow"
            }`}
          >
            {t.text} <span className="text-mist">({t.count})</span>
          </button>
        ))}
      </div>
      <div
        id="painel-produtos"
        ref={panel}
        tabIndex={-1}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        className="outline-none"
      >
        {pendingCleanup > 0 && (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-sm text-snow"
          >
            <span>
              {pendingCleanup === 1
                ? "1 foto de produto excluído ainda não saiu do armazenamento."
                : `${pendingCleanup} fotos de produtos excluídos ainda não saíram do armazenamento.`}{" "}
              Os produtos já foram apagados.
            </span>
            <button
              type="button"
              onClick={() => void retryCleanup()}
              disabled={cleaning}
              className="min-h-11 rounded-lg border border-line px-4 font-medium hover:border-coral disabled:opacity-60"
            >
              {cleaning ? "Limpando…" : "Repetir limpeza"}
            </button>
          </div>
        )}
        {tab === "published" && published.length > 0 && (
          <p className="mt-4 text-sm text-mist">
            A ordem é a do catálogo; o primeiro fica em destaque.
          </p>
        )}
        {tab === "published" && published.length > 1 && (
          <p id="ajuda-ordem" className="mt-1 text-sm text-mist">
            Arraste pela alça. No teclado: Espaço pega e solta, setas movem, Esc cancela.
          </p>
        )}
        <p aria-live="assertive" role="status" className="sr-only">
          {announcement}
        </p>
        <p
          className={`mt-2 min-h-5 text-sm ${status?.tone === "error" ? "text-coral" : "text-ok"}`}
        >
          {status?.text ?? ""}
        </p>
        {visible.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-line bg-panel/50 px-6 py-10 text-center">
            {tab === "drafts" ? (
              <>
                <p className="font-medium text-snow">Nenhum rascunho</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-mist">
                  Comece o cadastro de uma nova cachaça; ele fica salvo enquanto
                  você preenche.
                </p>
                <Link
                  href="/meu-espaco/produtos/novo"
                  className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-5 font-semibold text-white hover:bg-brand-strong"
                >
                  <span aria-hidden="true">+</span> Adicionar produto
                </Link>
              </>
            ) : (
              <>
                <p className="font-medium text-snow">
                  Nenhum produto publicado
                </p>
                <p className="mx-auto mt-2 max-w-md text-sm text-mist">
                  Publique um rascunho para ele aparecer na loja.
                </p>
              </>
            )}
          </div>
        ) : (
          <ol
            ref={listRef}
            className="mt-2 space-y-3"
            aria-label={
              tab === "published"
                ? "Produtos publicados, na ordem do catálogo"
                : "Rascunhos"
            }
          >
            {visible.map((product) => {
              const dragging = drag?.id === product.id;
              const grabbed = grab?.id === product.id;
              const others = drag
                ? visible.filter((p) => p.id !== drag.id)
                : [];
              // Linha de soltura antes deste item (ou depois do último).
              const lineBefore =
                drag && !dragging && others[drag.dropIndex]?.id === product.id;
              const lineAfter =
                drag &&
                !dragging &&
                drag.dropIndex >= others.length &&
                others[others.length - 1]?.id === product.id;
              return (
                <li
                  key={product.id}
                  style={
                    dragging
                      ? {
                          transform: `translateY(${drag!.offsetY}px) scale(1.02)`,
                        }
                      : undefined
                  }
                  ref={(el) => {
                    if (el) rows.current.set(product.id, el);
                    else rows.current.delete(product.id);
                  }}
                  className={`relative flex items-center gap-2 rounded-xl border bg-panel p-3 sm:gap-3 sm:p-4 ${
                    product.id === featured ? "border-coral/60" : "border-line"
                  } ${dragging ? "z-10 shadow-xl shadow-black/50" : "transition-shadow"} ${grabbed ? "ring-2 ring-coral" : ""}`}
                >
                  {lineBefore && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 -top-2 h-1 rounded bg-coral"
                    />
                  )}
                  {lineAfter && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 -bottom-2 h-1 rounded bg-coral"
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-panel-2 sm:h-24 sm:w-24">
                        {product.thumbnailUrl ? (
                          // URLs assinadas e temporárias do bucket privado: sem otimização do next/image.
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={product.thumbnailUrl}
                            alt={`Foto principal de ${label(product)}`}
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <span className="px-2 text-center text-xs text-mist">
                            Sem foto
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 break-words font-semibold text-snow">
                          {product.name ?? (
                            <span className="italic text-mist">Sem nome</span>
                          )}
                        </p>
                        <p className="mt-0.5 text-sm text-snow/90">
                          {product.priceBrlCents !== null
                            ? formatBrl(product.priceBrlCents)
                            : "Sem preço"}
                          <span aria-hidden="true" className="text-mist">
                            {" "}
                            ·{" "}
                          </span>
                          {product.volumeMl !== null
                            ? `${product.volumeMl} mL`
                            : "Volume não informado"}
                        </p>
                        {product.status === "pending" && (
                          <p className="text-sm font-medium text-warn">
                            Alterações pendentes
                          </p>
                        )}
                        {product.id === featured && (
                          <p className="text-sm font-medium text-coral">
                            Destaque da loja
                          </p>
                        )}
                        <p className="mt-1 text-xs text-mist">
                          Alterado em{" "}
                          {dateFormat.format(new Date(product.updatedAt))}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
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
                      <ProductActionsMenu
                        productLabel={label(product)}
                        disabled={saving}
                        onDelete={() =>
                          setDeleting({ id: product.id, name: label(product) })
                        }
                      />
                    </div>
                  </div>
                  {tab === "published" && (
                    <button
                      ref={(el) => {
                        if (el) handles.current.set(product.id, el);
                        else handles.current.delete(product.id);
                      }}
                      type="button"
                      aria-label={`Reordenar ${label(product)}, ${positionText(
                        shownPublished.map((p) => p.id),
                        product.id,
                      )}`}
                      aria-describedby="ajuda-ordem"
                      aria-pressed={grabbed}
                      aria-disabled={saving}
                      onPointerDown={(e) => onHandlePointerDown(e, product)}
                      onPointerMove={onHandlePointerMove}
                      onPointerUp={(e) => finishDrag(e, product, false)}
                      onPointerCancel={(e) => finishDrag(e, product, true)}
                      onKeyDown={(e) => onHandleKeyDown(e, product)}
                      onBlur={() => {
                        if (grab?.id === product.id) {
                          setGrab(null);
                          setAnnouncement("Movimento cancelado.");
                        }
                      }}
                      style={{ touchAction: "none" }}
                      className={`inline-flex min-h-11 w-9 shrink-0 select-none items-center justify-center self-stretch rounded-lg border text-mist hover:border-coral hover:text-snow focus-visible:outline-2 focus-visible:outline-coral aria-disabled:opacity-40 ${
                        dragging || grabbed
                          ? "cursor-grabbing border-coral text-snow"
                          : "cursor-grab border-line"
                      }`}
                    >
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="22"
                        viewBox="0 0 14 22"
                        fill="currentColor"
                      >
                        {[3, 11, 19].flatMap((y) =>
                          [3, 11].map((x) => (
                            <circle key={`${x}-${y}`} cx={x} cy={y} r="2" />
                          )),
                        )}
                      </svg>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      <DeleteProductDialog
        target={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={onDeleted}
      />
    </>
  );
}
