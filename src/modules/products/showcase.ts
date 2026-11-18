import { convertBrlCentsToCnyFen } from "./pricing";
import {
  AVAILABILITY_LABELS,
  CACHACA_TYPE_LABELS,
  type CachacaAttributes,
  type ProductDraft,
  type StoreOrigin,
} from "./schema";

/**
 * Modelo de exibição da vitrine. O mesmo componente público renderiza a
 * prévia do cadastro, a prévia da revisão e a vitrine publicada.
 */
export type ShowcaseFact = { label: string; value: string; valueLang?: "pt-BR" | "zh-Hans" };
type Lang = "pt-BR" | "zh-Hans";

export type ShowcaseView = {
  /** Idioma dos textos vindos do produtor/IA. Na prévia do rascunho, português. */
  contentLang: Lang;
  images: Array<{ id: string; url: string; alt: string }>;
  title: string | null;
  /** O nome pode ser chinês ou a marca original mantida pelo produtor. */
  titleLang: Lang;
  pinyin: string | null;
  originalName: string | null;
  brand: string | null;
  tagline: string | null;
  description: string | null;
  highlights: string[];
  facts: ShowcaseFact[];
  origin: string | null;
  producer: string | null;
  story: string | null;
  price: { cnyFen: number; brlCents: number } | null;
};

export const CATEGORY_ZH = "卡沙萨 · 巴西甘蔗蒸馏酒";

export const AVAILABILITY_ZH: Record<keyof typeof AVAILABILITY_LABELS, string> = {
  pronta_entrega: "现货",
  sob_encomenda: "按订单生产",
  producao_limitada: "限量生产",
};

export const CACHACA_TYPE_ZH: Record<keyof typeof CACHACA_TYPE_LABELS, string> = {
  branca: "银色（未陈酿）",
  armazenada: "木桶储存",
  envelhecida: "陈酿",
  premium: "优质陈酿",
  extra_premium: "特级陈酿",
};

function formatAbv(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}% vol`;
}

/** Ficha técnica: números e unidades sempre pela aplicação, a partir do cadastro. */
export function buildFacts(input: {
  attributes: CachacaAttributes;
  /** Textos livres já no idioma de exibição (português na prévia, chinês publicado). */
  text: { type: string | null; wood: string | null; aroma: string | null; flavor: string | null };
  textLang: Lang;
  minOrderUnits: number | null;
  availability: keyof typeof AVAILABILITY_LABELS | null;
}): ShowcaseFact[] {
  const a = input.attributes;
  const lang = input.textLang;
  const facts: ShowcaseFact[] = [];
  if (input.text.type) facts.push({ label: "类型", value: input.text.type, valueLang: lang });
  if (a.volume_ml !== null) facts.push({ label: "容量", value: `${a.volume_ml} mL` });
  if (a.abv_percent !== null) facts.push({ label: "酒精度", value: formatAbv(a.abv_percent) });
  if (input.text.wood) facts.push({ label: "木桶", value: input.text.wood, valueLang: lang });
  if (a.aging_months !== null) facts.push({ label: "陈酿", value: `${a.aging_months} 个月` });
  if (input.text.aroma) facts.push({ label: "香气", value: input.text.aroma, valueLang: lang });
  if (input.text.flavor) facts.push({ label: "口感", value: input.text.flavor, valueLang: lang });
  if (input.minOrderUnits !== null) facts.push({ label: "起订量", value: `${input.minOrderUnits} 瓶` });
  if (input.availability) facts.push({ label: "供货", value: AVAILABILITY_ZH[input.availability] });
  return facts;
}

export function formatOrigin(store: { city: string | null; state: string | null; region: string | null }): string | null {
  const place = [store.city, store.state].filter(Boolean).join(", ");
  return [place, store.region].filter(Boolean).join(" · ") || null;
}

export function imageAlts<T extends { id: string; url: string | null }>(images: T[], name: string) {
  return images
    .filter((img): img is T & { url: string } => Boolean(img.url))
    .map((img, index) => ({
      id: img.id,
      url: img.url,
      alt: index === 0 ? `Foto principal de ${name}` : `Foto ${index + 1} de ${name}`,
    }));
}

/** Prévia do rascunho: textos em português, rótulos e unidades pela aplicação. */
export function buildDraftPreview(
  product: ProductDraft,
  store: StoreOrigin,
  images: Array<{ id: string; url: string | null }>,
): ShowcaseView {
  const a = product.attributes;
  const cny = convertBrlCentsToCnyFen(product.price_brl_cents);
  const name = product.name ?? "Sua cachaça";
  return {
    contentLang: "pt-BR",
    images: imageAlts(images, name),
    title: product.name,
    titleLang: "pt-BR",
    pinyin: null,
    originalName: null,
    brand: product.brand,
    tagline: product.short_description,
    description: null,
    highlights: [],
    facts: buildFacts({
      attributes: a,
      text: { type: a.type ? CACHACA_TYPE_LABELS[a.type] : null, wood: a.wood, aroma: a.aroma, flavor: a.flavor },
      textLang: "pt-BR",
      minOrderUnits: product.min_order_units,
      availability: product.availability,
    }),
    origin: formatOrigin(store),
    producer: store.producer_name,
    story: [product.story, product.differentiator].filter(Boolean).join("\n\n") || null,
    price: product.price_brl_cents !== null && cny !== null ? { cnyFen: cny, brlCents: product.price_brl_cents } : null,
  };
}
