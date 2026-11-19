import { LogoMark, LogoName } from "@/components/brand/Logo";
import { FAIR_CARD_COPY, type FairCard } from "@/modules/stores/fair-card";

/**
 * Cartão comercial bilíngue do Modo Feira (direção B, clara). O mesmo
 * elemento aparece na prévia da tela e na impressão; na impressão ocupa
 * 180 mm de largura numa página A4 e preserva as cores do papel.
 */
export function FairCardView({ card, qrSvg }: { card: FairCard; qrSvg: string }) {
  const { featured } = card;
  return (
    <article
      id="cartao-feira"
      aria-labelledby="cartao-feira-produtor"
      className="theme-light mx-auto w-full max-w-[46rem] overflow-hidden rounded-3xl border border-sand bg-paper text-ink [print-color-adjust:exact] [-webkit-print-color-adjust:exact] print:w-[180mm] print:max-w-none print:break-inside-avoid print:rounded-[5mm] print:border-ink/25"
    >
      <header className="flex items-start justify-between gap-4 border-b-4 border-brand px-5 pb-5 pt-6 sm:px-7 print:px-[8mm] print:pt-[7mm]">
        <div className="min-w-0">
          <p className="text-sm font-medium tracking-wide text-brand">
            <span lang="zh-Hans">{FAIR_CARD_COPY.kicker.zh}</span>
            <span className="text-ink-soft"> · {FAIR_CARD_COPY.kicker.pt}</span>
          </p>
          <h2
            id="cartao-feira-produtor"
            className="mt-2 font-[family-name:var(--font-zh-serif)] text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
          >
            {card.producer}
          </h2>
          {card.origin && (
            <p className="mt-1.5 text-base text-ink-soft">
              <span lang="zh-Hans">{FAIR_CARD_COPY.originLabel}</span> · {card.origin}
              <span lang="zh-Hans" className="whitespace-nowrap">
                ，巴西
              </span>
            </p>
          )}
        </div>
        <p className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-ink-soft">
          <LogoMark className="h-8 w-auto" />
          <LogoName tone="light" className="hidden h-7 w-auto sm:inline print:inline" />
        </p>
      </header>

      <div className="grid sm:grid-cols-2 print:grid-cols-2">
        <figure className="flex flex-col border-sand bg-sand/40 sm:border-r print:border-r">
          {featured.image ? (
            // URL assinada e temporária do bucket privado: sem otimização do next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={featured.image.url}
              alt={featured.image.alt}
              className="aspect-square w-full object-contain print:aspect-auto print:h-[88mm]"
            />
          ) : (
            <div lang="zh-Hans" className="flex aspect-square items-center justify-center text-sm text-ink-soft print:aspect-auto print:h-[88mm]">
              暂无图片
            </div>
          )}
          <figcaption className="border-t border-sand bg-paper px-5 py-4 print:px-[6mm] print:py-[4mm]">
            <span lang="zh-Hans" className="block text-xs font-medium tracking-wide text-brand">
              精选推荐
            </span>
            <span lang={featured.titleLang} className="mt-1 block font-[family-name:var(--font-zh-serif)] text-xl font-bold leading-snug">
              {featured.title}
            </span>
            {featured.pinyin && (
              <span lang="zh-Latn-pinyin" className="block text-sm tracking-wide text-ink-soft">
                {featured.pinyin}
              </span>
            )}
            {featured.originalName && (
              <span lang="pt-BR" className="block text-sm text-ink-soft">
                {featured.originalName}
              </span>
            )}
          </figcaption>
        </figure>

        <div className="flex flex-col items-center justify-center gap-3 px-5 py-6 text-center print:px-[6mm]">
          <p lang="zh-Hans" className="text-2xl font-bold leading-snug">
            {FAIR_CARD_COPY.cta.zh}
          </p>
          <p className="text-base leading-snug text-ink-soft">{FAIR_CARD_COPY.cta.pt}</p>
          <div
            role="img"
            aria-label={`QR code do catálogo da loja: ${card.url}`}
            className="mt-1 w-52 rounded-xl border border-sand bg-white p-1 [&_svg]:h-auto [&_svg]:w-full print:w-[58mm]"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <p className="text-xs text-ink-soft">
            <span lang="zh-Hans">{FAIR_CARD_COPY.typeIt.zh}</span> · {FAIR_CARD_COPY.typeIt.pt}
          </p>
          <p data-testid="cartao-endereco" className="break-all font-mono text-[0.95rem] font-semibold leading-snug text-ink">
            {card.displayUrl}
          </p>
        </div>
      </div>
    </article>
  );
}
