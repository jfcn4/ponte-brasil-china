import { z } from "zod";
import { IdentityOutput, STRATEGIES, STRATEGY_LABELS, type Strategy } from "@/modules/ai/identity-contract";
import { DEMO_EXCHANGE_RATE, convertBrlCentsToCnyFen } from "./pricing";
import {
  AVAILABILITY_OPTIONS,
  CACHACA_TYPES,
  CachacaAttributes,
  type ProductDraft,
  type StoreOrigin,
} from "./schema";
import { CACHACA_TYPE_ZH, CATEGORY_ZH, buildFacts, formatOrigin, imageAlts, type ShowcaseView } from "./showcase";

/**
 * Versão aprovada: o que o comprador vê. Montada por uma única função a
 * partir do cadastro (fatos, preço, origem) e da adaptação (linguagem), usada
 * tanto na prévia da revisão quanto na publicação.
 */
export const CHOICES = [...STRATEGIES, "original"] as const;
export type Choice = (typeof CHOICES)[number];
export const CHOICE_LABELS: Record<Choice, string> = { ...STRATEGY_LABELS, original: "Nome original" };

export const PresentationSnapshot = z
  .object({
    schema_version: z.literal(1),
    choice: z.enum(CHOICES),
    name: z
      .object({
        display: z.string().min(1),
        display_lang: z.enum(["zh-Hans", "pt-BR"]),
        pinyin: z.string().nullable(),
        original: z.string().min(1),
        brand: z.string().nullable(),
      })
      .strict(),
    category_zh: z.literal(CATEGORY_ZH),
    content: z
      .object({
        tagline_zh: z.string().min(1),
        description_zh: z.string().min(1),
        story_zh: z.string().nullable(),
        highlights_zh: z.array(z.string().min(1)).max(3),
      })
      .strict(),
    facts: z
      .object({
        attributes: CachacaAttributes,
        type_zh: z.string().nullable(),
        wood_zh: z.string().nullable(),
        aroma_zh: z.string().nullable(),
        flavor_zh: z.string().nullable(),
        min_order_units: z.number().int().positive().nullable(),
        availability: z.enum(AVAILABILITY_OPTIONS).nullable(),
      })
      .strict(),
    price: z
      .object({
        brl_cents: z.number().int().min(0),
        cny_fen: z.number().int().min(0),
        from: z.literal("BRL"),
        to: z.literal("CNY"),
        rate: z.string().regex(/^\d+\.\d+$/),
        demonstrative: z.literal(true),
      })
      .strict()
      .nullable(),
    producer: z
      .object({
        name: z.string().min(1),
        city: z.string().nullable(),
        state: z.string().nullable(),
        region: z.string().nullable(),
      })
      .strict(),
  })
  .strict();
export type PresentationSnapshot = z.infer<typeof PresentationSnapshot>;

export class SnapshotError extends Error {
  constructor(readonly code: "missing_producer" | "missing_name" | "unknown_option") {
    super(code);
  }
}

export function optionFor(output: IdentityOutput, strategy: Strategy) {
  return output.options.find((o) => o.strategy === strategy) ?? null;
}

export function recommendedChoice(output: IdentityOutput): Strategy {
  return output.options.find((o) => o.id === output.recommendation.option_id)?.strategy ?? "equilibrada";
}

/** O que falta para publicar, além da adaptação válida. */
export function missingForPublication(input: { store: StoreOrigin; imageCount: number }) {
  const missing: Array<"producer_name" | "image"> = [];
  if (!input.store.producer_name?.trim()) missing.push("producer_name");
  if (input.imageCount < 1) missing.push("image");
  return missing;
}

/** Monta a versão a publicar. Preço convertido pela regra única do câmbio. */
export function buildSnapshot(input: {
  product: ProductDraft;
  store: StoreOrigin;
  output: IdentityOutput;
  choice: Choice;
}): PresentationSnapshot {
  const { product, store, output, choice } = input;
  if (!product.name) throw new SnapshotError("missing_name");
  if (!store.producer_name) throw new SnapshotError("missing_producer");

  let name: PresentationSnapshot["name"];
  if (choice === "original") {
    name = { display: product.name, display_lang: "pt-BR", pinyin: null, original: product.name, brand: product.brand };
  } else {
    const option = optionFor(output, choice);
    if (!option) throw new SnapshotError("unknown_option");
    name = { display: option.hanzi, display_lang: "zh-Hans", pinyin: option.pinyin, original: product.name, brand: product.brand };
  }

  const cnyFen = convertBrlCentsToCnyFen(product.price_brl_cents);
  const a = product.attributes;
  return {
    schema_version: 1,
    choice,
    name,
    category_zh: CATEGORY_ZH,
    content: {
      tagline_zh: output.content.tagline.zh,
      description_zh: output.content.description.zh,
      story_zh: output.content.story?.zh ?? null,
      highlights_zh: output.content.highlights.map((h) => h.zh),
    },
    facts: {
      attributes: a,
      type_zh: a.type && (CACHACA_TYPES as readonly string[]).includes(a.type) ? CACHACA_TYPE_ZH[a.type] : null,
      wood_zh: a.wood ? output.attributes_zh.wood : null,
      aroma_zh: a.aroma ? output.attributes_zh.aroma : null,
      flavor_zh: a.flavor ? output.attributes_zh.flavor : null,
      min_order_units: product.min_order_units,
      availability: product.availability,
    },
    price:
      product.price_brl_cents === null || cnyFen === null
        ? null
        : {
            brl_cents: product.price_brl_cents,
            cny_fen: cnyFen,
            from: DEMO_EXCHANGE_RATE.from,
            to: DEMO_EXCHANGE_RATE.to,
            rate: DEMO_EXCHANGE_RATE.rate,
            demonstrative: DEMO_EXCHANGE_RATE.demonstrative,
          },
    producer: { name: store.producer_name, city: store.city, state: store.state, region: store.region },
  };
}

/** Vitrine chinesa a partir da versão (prévia da revisão ou página pública). */
export function snapshotToView(snapshot: PresentationSnapshot, images: Array<{ id: string; url: string | null }>): ShowcaseView {
  const f = snapshot.facts;
  return {
    contentLang: "zh-Hans",
    images: imageAlts(images, snapshot.name.original).map((img, index) => ({
      ...img,
      alt: index === 0 ? `${snapshot.name.display} 主图` : `${snapshot.name.display} 图片 ${index + 1}`,
    })),
    title: snapshot.name.display,
    titleLang: snapshot.name.display_lang,
    pinyin: snapshot.name.pinyin,
    originalName: snapshot.choice === "original" ? null : snapshot.name.original,
    brand: snapshot.name.brand,
    tagline: snapshot.content.tagline_zh,
    description: snapshot.content.description_zh,
    highlights: snapshot.content.highlights_zh,
    facts: buildFacts({
      attributes: f.attributes,
      text: { type: f.type_zh, wood: f.wood_zh, aroma: f.aroma_zh, flavor: f.flavor_zh },
      textLang: "zh-Hans",
      minOrderUnits: f.min_order_units,
      availability: f.availability,
    }),
    origin: formatOrigin(snapshot.producer),
    producer: snapshot.producer.name,
    story: snapshot.content.story_zh,
    price: snapshot.price ? { cnyFen: snapshot.price.cny_fen, brlCents: snapshot.price.brl_cents } : null,
  };
}

/** Sem produtor ainda: prévia da revisão com nome provisório, sem gravar nada. */
export function previewSnapshot(input: Parameters<typeof buildSnapshot>[0]): PresentationSnapshot {
  return buildSnapshot({
    ...input,
    store: { ...input.store, producer_name: input.store.producer_name ?? "（生产者待填写）" },
  });
}
