import type { ReactNode } from "react";
import { productPath } from "@/lib/paths";
import { formatCny } from "@/modules/products/pricing";
import { CATEGORY_ZH } from "@/modules/products/showcase";
import type { CatalogItem, StoreCatalogView } from "@/modules/stores/catalog-view";
import { PublicPhoto } from "./PublicPhoto";

type CardOptions = { href: (slug: string) => string; inquiry: boolean };

/**
 * Catálogo público da loja (direção B, editorial clara). Usado na página do
 * comprador (/l/<código>), na prévia de "Minha loja" e nas lojas fictícias do
 * diretório (/zh/explorar). Só recebe produtos publicados, na ordem da loja;
 * o primeiro ocupa o destaque.
 */
export function StoreCatalog({
  view,
  titleAs: Title = "h1",
  productHref = productPath,
  inquiry = true,
  notice,
}: {
  view: StoreCatalogView;
  titleAs?: "h1" | "h2";
  /** Destino de cada produto; por padrão a vitrine real (/p/<código>). */
  productHref?: (slug: string) => string;
  /** Sem consulta comercial (lojas fictícias), o convite fala só em detalhes. */
  inquiry?: boolean;
  /** Aviso acima do título, ex. a identificação de demonstração. */
  notice?: ReactNode;
}) {
  const [featured, ...others] = view.items;
  const card: CardOptions = { href: productHref, inquiry };
  return (
    <div lang="zh-Hans" className="theme-light @container rounded-3xl bg-ivory text-ink">
      <header className="px-1 pb-6 pt-2">
        {notice}
        <p className="text-sm font-medium tracking-wide text-brand">{view.kicker ?? "巴西卡沙萨生产者"}</p>
        <Title lang="pt-BR" className="mt-2 font-[family-name:var(--font-zh-serif)] text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {view.producer}
        </Title>
        {view.origin && (
          <p className="mt-1 text-sm text-ink-soft">
            产地 · <span lang="pt-BR">{view.origin}</span>，巴西
          </p>
        )}
        {view.intro && <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink">{view.intro}</p>}
      </header>

      {!featured ? (
        <div className="rounded-2xl border border-dashed border-sand bg-paper px-6 py-12 text-center">
          <p className="font-medium text-ink">该店铺暂无在售产品</p>
          <p className="mt-2 text-sm text-ink-soft">生产者重新上架后，产品会显示在这里。请稍后再访问此链接。</p>
        </div>
      ) : (
        <>
          <section aria-labelledby="catalog-featured">
            <h2 id="catalog-featured" className="sr-only">
              精选推荐
            </h2>
            <FeaturedCard item={featured} card={card} />
          </section>

          {others.length > 0 && (
            <section className="mt-8" aria-labelledby="catalog-all">
              <h2 id="catalog-all" className="text-sm font-semibold text-ink">
                更多产品 <span className="font-normal text-ink-soft">（{others.length}）</span>
              </h2>
              <ul className="mt-3 grid gap-4 @xl:grid-cols-2">
                {others.map((item) => (
                  <li key={item.slug}>
                    <ItemCard item={item} card={card} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ItemTitle({ item, className }: { item: CatalogItem; className: string }) {
  return (
    <>
      <span lang={item.titleLang} className={className}>
        {item.title}
      </span>
      {item.pinyin && (
        <span lang="zh-Latn-pinyin" className="mt-0.5 block text-sm tracking-wide text-ink-soft">
          {item.pinyin}
        </span>
      )}
      {item.originalName && (
        <span lang="pt-BR" className="mt-0.5 block text-sm text-ink-soft">
          {item.originalName}
        </span>
      )}
    </>
  );
}

function Price({ item }: { item: CatalogItem }) {
  return item.price ? (
    <p className="text-ink">
      参考价格 <span className="font-semibold text-brand">{formatCny(item.price.cnyFen)}</span>
    </p>
  ) : (
    <p className="text-ink-soft">价格面议 · 欢迎询价</p>
  );
}

function Photo({ item, className, priority = false }: { item: CatalogItem; className: string; priority?: boolean }) {
  return item.image ? (
    <PublicPhoto src={item.image.url} alt={item.image.alt} priority={priority} className={className} />
  ) : (
    <div className={`flex items-center justify-center text-sm text-ink-soft ${className}`}>暂无图片</div>
  );
}

function Tag({ item }: { item: CatalogItem }) {
  return item.tag ? (
    <span className="w-fit text-xs font-medium text-brand">
      {item.tag}
    </span>
  ) : null;
}

function FeaturedCard({ item, card }: { item: CatalogItem; card: CardOptions }) {
  return (
    <a
      href={card.href(item.slug)}
      className="group block overflow-hidden rounded-3xl border border-sand bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand @lg:grid @lg:grid-cols-2"
    >
      <div className="relative bg-sand/40">
        <span aria-hidden="true" className="absolute left-3 top-3 z-10 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
          精选推荐
        </span>
        <Photo item={item} priority className="aspect-square max-h-[55svh] w-full object-contain @lg:max-h-none" />
      </div>
      <div className="flex flex-col justify-center gap-3 p-5 @lg:p-8">
        <Tag item={item} />
        <p className="text-xs font-medium tracking-wide text-brand">{item.category ?? CATEGORY_ZH}</p>
        <p>
          <ItemTitle item={item} className="block font-[family-name:var(--font-zh-serif)] text-3xl font-bold leading-tight" />
        </p>
        <p className="leading-relaxed text-ink">{item.tagline}</p>
        {item.specs && <p className="text-sm text-ink-soft">{item.specs}</p>}
        <Price item={item} />
        <span className="mt-1 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-5 font-semibold text-white group-hover:bg-brand-strong">
          {card.inquiry ? "查看详情并询价" : "查看详情"}
        </span>
      </div>
    </a>
  );
}

function ItemCard({ item, card }: { item: CatalogItem; card: CardOptions }) {
  return (
    <a
      href={card.href(item.slug)}
      className="flex h-full gap-4 overflow-hidden rounded-2xl border border-sand bg-paper p-3 hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    >
      <Photo item={item} className="h-28 w-24 shrink-0 rounded-xl bg-sand/40 object-contain" />
      <div className="flex min-w-0 flex-col gap-1">
        <Tag item={item} />
        <p>
          <ItemTitle item={item} className="block text-lg font-semibold leading-snug" />
        </p>
        <p className="line-clamp-2 text-sm leading-relaxed text-ink">{item.tagline}</p>
        {item.specs && <p className="text-xs text-ink-soft">{item.specs}</p>}
        <div className="mt-auto pt-1 text-sm">
          <Price item={item} />
        </div>
        <span className="text-sm font-medium text-brand">查看详情 →</span>
      </div>
    </a>
  );
}
