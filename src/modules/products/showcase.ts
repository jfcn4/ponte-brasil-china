import { convertBrlCentsToCnyFen } from "./pricing";
import {
  AVAILABILITY_LABELS,
  CACHACA_TYPE_LABELS,
  type ProductDraft,
  type StoreOrigin,
} from "./schema";

/**
 * Modelo de exibição da vitrine. O mesmo componente público renderiza a
 * prévia do produtor e, depois da publicação, a vitrine do comprador.
 */
export type ShowcaseFact = { label: string; value: string; valueLang?: "pt-BR" | "zh-Hans" };

export type ShowcaseView = {
  /** Idioma dos textos vindos do produtor/IA. Na prévia do rascunho, português. */
  contentLang: "pt-BR" | "zh-Hans";
  images: Array<{ id: string; url: string; alt: string }>;
  title: string | null;
  originalName: string | null;
  brand: string | null;
  tagline: string | null;
  facts: ShowcaseFact[];
  origin: string | null;
  producer: string | null;
  story: string | null;
  price: { cnyFen: number; brlCents: number } | null;
};

export const CATEGORY_ZH = "卡沙萨 · 巴西甘蔗蒸馏酒";

const AVAILABILITY_ZH: Record<keyof typeof AVAILABILITY_LABELS, string> = {
  pronta_entrega: "现货",
  sob_encomenda: "按订单生产",
  producao_limitada: "限量生产",
};

function formatAbv(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}% vol`;
}

/** Prévia do rascunho: textos em português, rótulos e unidades pela aplicação. */
export function buildDraftPreview(
  product: ProductDraft,
  store: StoreOrigin,
  images: Array<{ id: string; url: string | null }>,
): ShowcaseView {
  const a = product.attributes;
  const facts: ShowcaseFact[] = [];
  if (a.type) facts.push({ label: "类型", value: CACHACA_TYPE_LABELS[a.type], valueLang: "pt-BR" });
  if (a.volume_ml !== null) facts.push({ label: "容量", value: `${a.volume_ml} mL` });
  if (a.abv_percent !== null) facts.push({ label: "酒精度", value: formatAbv(a.abv_percent) });
  if (a.wood) facts.push({ label: "木桶", value: a.wood, valueLang: "pt-BR" });
  if (a.aging_months !== null) facts.push({ label: "陈酿", value: `${a.aging_months} 个月` });
  if (a.aroma) facts.push({ label: "香气", value: a.aroma, valueLang: "pt-BR" });
  if (a.flavor) facts.push({ label: "口感", value: a.flavor, valueLang: "pt-BR" });
  if (product.min_order_units !== null) facts.push({ label: "起订量", value: `${product.min_order_units} 瓶` });
  if (product.availability) facts.push({ label: "供货", value: AVAILABILITY_ZH[product.availability] });

  const place = [store.city, store.state].filter(Boolean).join(", ");
  const origin = [place, store.region].filter(Boolean).join(" · ") || null;
  const cny = convertBrlCentsToCnyFen(product.price_brl_cents);

  const name = product.name ?? "Sua cachaça";
  return {
    contentLang: "pt-BR",
    images: images
      .filter((img): img is { id: string; url: string } => Boolean(img.url))
      .map((img, index) => ({
        id: img.id,
        url: img.url,
        alt: index === 0 ? `Foto principal de ${name}` : `Foto ${index + 1} de ${name}`,
      })),
    title: product.name,
    originalName: null,
    brand: product.brand,
    tagline: product.short_description,
    facts,
    origin,
    producer: store.producer_name,
    story: [product.story, product.differentiator].filter(Boolean).join("\n\n") || null,
    price: product.price_brl_cents !== null && cny !== null ? { cnyFen: cny, brlCents: product.price_brl_cents } : null,
  };
}
