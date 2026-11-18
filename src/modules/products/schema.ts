import { z } from "zod";

/** Características de posicionamento. O produtor escolhe até duas. */
export const PERSONALITY_TRAITS = ["artesanal", "tradicional", "premium", "inovadora", "sustentavel", "familiar"] as const;
export const PERSONALITY_LABELS: Record<(typeof PERSONALITY_TRAITS)[number], string> = {
  artesanal: "Artesanal",
  tradicional: "Tradicional",
  premium: "Premium",
  inovadora: "Inovadora",
  sustentavel: "Sustentável",
  familiar: "Familiar",
};

export const CACHACA_TYPES = ["branca", "armazenada", "envelhecida", "premium", "extra_premium"] as const;
export const CACHACA_TYPE_LABELS: Record<(typeof CACHACA_TYPES)[number], string> = {
  branca: "Branca (prata)",
  armazenada: "Armazenada em madeira",
  envelhecida: "Envelhecida",
  premium: "Premium",
  extra_premium: "Extra premium",
};

export const AVAILABILITY_OPTIONS = ["pronta_entrega", "sob_encomenda", "producao_limitada"] as const;
export const AVAILABILITY_LABELS: Record<(typeof AVAILABILITY_OPTIONS)[number], string> = {
  pronta_entrega: "Pronta entrega",
  sob_encomenda: "Sob encomenda",
  producao_limitada: "Produção limitada",
};

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const LIMITS = {
  name: 80,
  brand: 80,
  shortDescription: 400,
  story: 2000,
  differentiator: 600,
  aroma: 200,
  flavor: 200,
  wood: 60,
  notes: 1000,
  producerName: 120,
  city: 80,
  region: 80,
  maxImages: 3,
  maxPersonality: 2,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max).nullable();

const oneDecimal = (value: number) => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9;

export const CachacaAttributes = z
  .object({
    type: z.enum(CACHACA_TYPES).nullable(),
    volume_ml: z.number().int().min(50).max(5000).nullable(),
    abv_percent: z.number().min(0).max(80).refine(oneDecimal, "Use no máximo uma casa decimal").nullable(),
    wood: text(LIMITS.wood),
    aging_months: z.number().int().min(0).max(600).nullable(),
    aroma: text(LIMITS.aroma),
    flavor: text(LIMITS.flavor),
  })
  .strict();
export type CachacaAttributes = z.infer<typeof CachacaAttributes>;

export const ProductDraft = z
  .object({
    name: text(LIMITS.name),
    brand: text(LIMITS.brand),
    short_description: text(LIMITS.shortDescription),
    personality: z
      .array(z.enum(PERSONALITY_TRAITS))
      .max(LIMITS.maxPersonality)
      .refine((list) => new Set(list).size === list.length, "Características repetidas"),
    attributes: CachacaAttributes,
    story: text(LIMITS.story),
    differentiator: text(LIMITS.differentiator),
    price_brl_cents: z.number().int().min(0).max(100_000_000).nullable(),
    min_order_units: z.number().int().min(1).max(1_000_000).nullable(),
    availability: z.enum(AVAILABILITY_OPTIONS).nullable(),
    notes: text(LIMITS.notes),
  })
  .strict();
export type ProductDraft = z.infer<typeof ProductDraft>;

export const StoreOrigin = z
  .object({
    producer_name: text(LIMITS.producerName),
    city: text(LIMITS.city),
    state: z.enum(BR_STATES).nullable(),
    region: text(LIMITS.region),
  })
  .strict();
export type StoreOrigin = z.infer<typeof StoreOrigin>;

export const SaveDraftRequest = z
  .object({
    expectedRevision: z.number().int().positive().nullable(),
    product: ProductDraft,
    store: StoreOrigin,
  })
  .strict();
export type SaveDraftRequest = z.infer<typeof SaveDraftRequest>;

export const SaveDraftResponse = z.object({
  product: z.object({ id: z.uuid(), revision: z.number().int().positive(), updatedAt: z.string() }),
});
export type SaveDraftResponse = z.infer<typeof SaveDraftResponse>;

export const ProductImageView = z.object({
  id: z.uuid(),
  position: z.number().int().min(0).max(2),
  url: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
});
export type ProductImageView = z.infer<typeof ProductImageView>;

export const ImagesResponse = z.object({ images: z.array(ProductImageView) });

/** Linha de products como vem do banco. */
export const ProductRow = z.object({
  id: z.uuid(),
  store_id: z.uuid(),
  category: z.literal("cachaca"),
  status: z.enum(["draft", "published", "withdrawn"]),
  revision: z.number().int().positive(),
  media_revision: z.number().int().positive(),
  public_slug: z.string().nullable(),
  published_presentation_id: z.uuid().nullable(),
  name: z.string().nullable(),
  brand: z.string().nullable(),
  short_description: z.string().nullable(),
  personality: z.array(z.enum(PERSONALITY_TRAITS)),
  attributes: CachacaAttributes.partial(),
  story: z.string().nullable(),
  differentiator: z.string().nullable(),
  price_brl_cents: z.number().int().nullable(),
  min_order_units: z.number().int().nullable(),
  availability: z.enum(AVAILABILITY_OPTIONS).nullable(),
  notes: z.string().nullable(),
  position: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ProductRow = z.infer<typeof ProductRow>;

export const EMPTY_ATTRIBUTES: CachacaAttributes = {
  type: null,
  volume_ml: null,
  abv_percent: null,
  wood: null,
  aging_months: null,
  aroma: null,
  flavor: null,
};

export function rowToDraft(row: ProductRow): ProductDraft {
  return {
    name: row.name,
    brand: row.brand,
    short_description: row.short_description,
    personality: row.personality,
    attributes: { ...EMPTY_ATTRIBUTES, ...row.attributes },
    story: row.story,
    differentiator: row.differentiator,
    price_brl_cents: row.price_brl_cents,
    min_order_units: row.min_order_units,
    availability: row.availability,
    notes: row.notes,
  };
}

/** Nome, descrição e uma foto bastam para gerar a apresentação chinesa. */
export function missingForGeneration(input: {
  name: string | null;
  short_description: string | null;
  imageCount: number;
}): Array<"name" | "short_description" | "image"> {
  const missing: Array<"name" | "short_description" | "image"> = [];
  if (!input.name?.trim()) missing.push("name");
  if (!input.short_description?.trim()) missing.push("short_description");
  if (input.imageCount < 1) missing.push("image");
  return missing;
}

/** Estados exibidos ao produtor. "pending" = publicado com alterações ainda privadas. */
export const PRODUCT_STATUS_LABELS = {
  draft: "Rascunho",
  published: "Publicado",
  pending: "Alterações pendentes",
  withdrawn: "Retirado",
} as const;
export type DisplayStatus = keyof typeof PRODUCT_STATUS_LABELS;
