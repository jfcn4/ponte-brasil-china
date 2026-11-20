import type { ReactNode } from "react";
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
  titleAs: Title = "h2",
  notice,
}: {
  view: ShowcaseView;
  /** Na prévia o botão de consulta aparece desativado; na vitrine, o formulário de consulta. */
  inquiry: { enabled: false; reason: string; reasonLang?: "pt-BR" | "zh-Hans" } | { enabled: true; panel: ReactNode };
  /** Na página pública o nome do produto é o título principal (h1). */
  titleAs?: "h1" | "h2";
  /** Aviso acima do nome, ex. a identificação de demonstração. */
  notice?: ReactNode;
}) {
  const lang = view.contentLang;
  return (
    <article lang="zh-Hans" className="theme-light rounded-3xl bg-ivory p-4 text-ink sm:p-6">
      <Gallery images={view.images} />

      <header className="mt-6">
        {notice}
        <p className="text-sm font-medium tracking-wide text-brand">{view.category ?? CATEGORY_ZH}</p>
        <Title
          lang={view.titleLang}
          className="mt-2 font-[family-name:var(--font-zh-serif)] text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl"
        >
          {view.title ?? <span className="text-ink-soft/70">Nome do produto</span>}
        </Title>
        {view.pinyin && (
          <p lang="zh-Latn-pinyin" className="mt-1 text-base tracking-wide text-ink-soft">
            {view.pinyin}
          </p>
        )}
        {(view.originalName || view.brand) && (
          <p lang="pt-BR" className="mt-1 text-sm text-ink-soft">
            {[view.originalName, view.brand].filter(Boolean).join(" · ")}
          </p>
        )}
        {view.tagline && (
          <p lang={lang} className="mt-4 text-lg leading-relaxed text-ink">
            {view.tagline}
          </p>
        )}
        {view.description && (
          <p lang={lang} className="mt-2 leading-relaxed text-ink-soft">
            {view.description}
          </p>
        )}
      </header>

      {view.highlights.length > 0 && (
        <section className="mt-6" aria-labelledby="showcase-highlights">
          <h3 id="showcase-highlights" className="text-sm font-semibold text-ink">
            产品亮点
          </h3>
          <ul className="mt-2 space-y-2">
            {view.highlights.map((highlight) => (
              <li key={highlight} lang={lang} className="flex gap-2 leading-relaxed text-ink">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                {highlight}
              </li>
            ))}
          </ul>
        </section>
      )}

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

      {/* Só o nome do produtor não é origem nem história: o título muda e, sem nada, a seção some. */}
      {(view.origin || view.producer || view.story) && (
        <section className="mt-6" aria-labelledby="showcase-story">
          <h3 id="showcase-story" className="text-sm font-semibold text-ink">
            {view.origin || view.story ? "产地与故事" : "生产者"}
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
          inquiry.panel
        ) : (
          <>
            <button
              type="button"
              disabled
              aria-describedby="inquiry-disabled-reason"
              className="flex min-h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-brand/80 text-lg font-semibold text-white"
            >
              <InquiryLabel />
            </button>
            <p id="inquiry-disabled-reason" lang={inquiry.reasonLang ?? "pt-BR"} className="mt-2 text-center text-xs text-ink-soft">
              {inquiry.reason}
            </p>
          </>
        )}
      </section>
    </article>
  );
}

/** Rótulo do botão de consulta, só em chinês: a vitrine é lida pelo comprador. */
export function InquiryLabel() {
  return (
    <>
      <span>询价</span>
    </>
  );
}
