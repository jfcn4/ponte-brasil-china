import { formatBrlForBuyer, formatCny } from "@/modules/products/pricing";
import { CATEGORY_ZH, type ShowcaseView } from "@/modules/products/showcase";
import { Gallery } from "./Gallery";

/**
 * Vitrine pública do produto (direção B, editorial clara). Usada na prévia do
 * cadastro e, após a publicação, na página do comprador. Omite campos vazios.
 * Sequência: foto → identidade → atributos → história → preço e contato.
 */
export function ProductShowcase({
  view,
  inquiry,
}: {
  view: ShowcaseView;
  /** Na prévia o botão de consulta aparece desativado. */
  inquiry: { enabled: false; reason: string } | { enabled: true; href: string };
}) {
  const lang = view.contentLang;
  return (
    <article lang="zh-Hans" className="theme-light rounded-3xl bg-ivory p-4 text-ink sm:p-6">
      <Gallery images={view.images} />

      <header className="mt-6">
        <p className="text-sm font-medium tracking-wide text-brand">{CATEGORY_ZH}</p>
        <h2
          lang={lang}
          className="mt-2 font-[family-name:var(--font-zh-serif)] text-3xl font-bold leading-tight tracking-tight text-ink"
        >
          {view.title ?? <span className="text-ink-soft/70">Nome do produto</span>}
        </h2>
        {(view.originalName || view.brand) && (
          <p lang="pt-BR" className="mt-1 text-sm text-ink-soft">
            {[view.originalName, view.brand].filter(Boolean).join(" · ")}
          </p>
        )}
        {view.tagline && (
          <p lang={lang} className="mt-4 text-base leading-relaxed text-ink">
            {view.tagline}
          </p>
        )}
      </header>

      {view.facts.length > 0 && (
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-sand bg-sand">
          {view.facts.map((fact) => (
            <div key={fact.label} className="bg-paper px-4 py-3">
              <dt className="text-xs text-ink-soft">{fact.label}</dt>
              <dd lang={fact.valueLang} className="mt-0.5 font-medium text-ink">
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {(view.origin || view.producer || view.story) && (
        <section className="mt-6" aria-labelledby="showcase-story">
          <h3 id="showcase-story" className="text-sm font-semibold text-ink">
            产地与故事
          </h3>
          {(view.producer || view.origin) && (
            <p lang="pt-BR" className="mt-1 text-sm text-ink-soft">
              {[view.producer, view.origin].filter(Boolean).join(" · ")}
            </p>
          )}
          {view.story && (
            <p lang={lang} className="mt-3 whitespace-pre-line leading-relaxed text-ink">
              {view.story}
            </p>
          )}
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-sand bg-paper p-4" aria-label="价格与询价">
        {view.price && (
          <div className="mb-4">
            <p className="text-2xl font-bold text-ink">
              参考价格 <span className="text-brand">{formatCny(view.price.cnyFen)}</span>
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">{formatBrlForBuyer(view.price.brlCents)}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              演示汇率：1 巴西雷亚尔 = 1.15 元人民币。最终价格以报价为准。
            </p>
          </div>
        )}
        {inquiry.enabled ? (
          <a
            href={inquiry.href}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-brand text-lg font-semibold text-white hover:bg-brand-strong"
          >
            询价
          </a>
        ) : (
          <>
            <button
              type="button"
              disabled
              aria-describedby="inquiry-disabled-reason"
              className="flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-xl bg-brand/80 text-lg font-semibold text-white"
            >
              询价
            </button>
            <p id="inquiry-disabled-reason" lang="pt-BR" className="mt-2 text-center text-xs text-ink-soft">
              {inquiry.reason}
            </p>
          </>
        )}
      </section>
    </article>
  );
}
