import { centsToBrlInput, parseBrlInput } from "./pricing";
import {
  AVAILABILITY_OPTIONS,
  BR_STATES,
  CACHACA_TYPES,
  LIMITS,
  PERSONALITY_TRAITS,
  ProductDraft,
  StoreOrigin,
} from "./schema";

/** Estado do formulário: o que o produtor digitou, sempre como texto. */
export type ProductForm = {
  name: string;
  brand: string;
  short_description: string;
  personality: Array<(typeof PERSONALITY_TRAITS)[number]>;
  type: string;
  volume_ml: string;
  abv_percent: string;
  wood: string;
  aging_months: string;
  aroma: string;
  flavor: string;
  producer_name: string;
  city: string;
  state: string;
  region: string;
  story: string;
  differentiator: string;
  price: string;
  min_order_units: string;
  availability: string;
  notes: string;
};

export type FormField = keyof ProductForm;
export type FieldErrors = Partial<Record<FormField, string>>;

export const EMPTY_FORM: ProductForm = {
  name: "",
  brand: "",
  short_description: "",
  personality: [],
  type: "",
  volume_ml: "",
  abv_percent: "",
  wood: "",
  aging_months: "",
  aroma: "",
  flavor: "",
  producer_name: "",
  city: "",
  state: "",
  region: "",
  story: "",
  differentiator: "",
  price: "",
  min_order_units: "",
  availability: "",
  notes: "",
};

const MAX_LENGTH: Partial<Record<FormField, number>> = {
  name: LIMITS.name,
  brand: LIMITS.brand,
  short_description: LIMITS.shortDescription,
  wood: LIMITS.wood,
  aroma: LIMITS.aroma,
  flavor: LIMITS.flavor,
  producer_name: LIMITS.producerName,
  city: LIMITS.city,
  region: LIMITS.region,
  story: LIMITS.story,
  differentiator: LIMITS.differentiator,
  notes: LIMITS.notes,
};

export function maxLengthOf(field: FormField): number | undefined {
  return MAX_LENGTH[field];
}

function textOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseInteger(value: string, min: number, max: number): { ok: true; value: number | null } | { ok: false } {
  const trimmed = value.trim().replace(/\./g, "");
  if (trimmed === "") return { ok: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false };
  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) return { ok: false };
  return { ok: true, value: parsed };
}

function parseOneDecimal(value: string, min: number, max: number): { ok: true; value: number | null } | { ok: false } {
  const trimmed = value.trim().replace(",", ".");
  if (trimmed === "") return { ok: true, value: null };
  if (!/^\d{1,2}(\.\d)?$/.test(trimmed)) return { ok: false };
  const parsed = Number(trimmed);
  if (parsed < min || parsed > max) return { ok: false };
  return { ok: true, value: Math.round(parsed * 10) / 10 };
}

function isOneOf<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

/**
 * Converte o formulário no rascunho. Campos opcionais vazios viram null.
 * Valores fora do formato voltam como erro do próprio campo e ficam nulos no
 * rascunho devolvido, que serve à prévia. Só `ok: true` pode ser gravado.
 */
export function formToDraft(form: ProductForm): {
  ok: boolean;
  product: ProductDraft;
  store: StoreOrigin;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {};
  const clip = (field: FormField, value: string): string | null => {
    const max = MAX_LENGTH[field];
    const text = textOrNull(value);
    if (text !== null && max !== undefined && text.length > max) {
      errors[field] = `Use até ${max} caracteres.`;
      return text.slice(0, max);
    }
    return text;
  };

  const volume = parseInteger(form.volume_ml, 50, 5000);
  if (!volume.ok) errors.volume_ml = "Informe o volume em mL, entre 50 e 5000 (ex.: 700).";

  const abv = parseOneDecimal(form.abv_percent, 0, 80);
  if (!abv.ok) errors.abv_percent = "Informe o teor em %, de 0 a 80, com até uma casa decimal (ex.: 40 ou 40,5).";

  const aging = parseInteger(form.aging_months, 0, 600);
  if (!aging.ok) errors.aging_months = "Informe o envelhecimento em meses inteiros (ex.: 24).";

  const price = parseBrlInput(form.price);
  if (!price.ok) errors.price = "Use o formato 79,00. Deixe vazio para preço sob consulta.";

  const minOrder = parseInteger(form.min_order_units, 1, 1_000_000);
  if (!minOrder.ok) errors.min_order_units = "Informe a quantidade mínima em garrafas inteiras (ex.: 100).";

  const type = form.type === "" ? null : isOneOf(CACHACA_TYPES, form.type) ? form.type : null;
  if (form.type && !type) errors.type = "Escolha um tipo da lista.";
  const state = form.state === "" ? null : isOneOf(BR_STATES, form.state) ? form.state : null;
  if (form.state && !state) errors.state = "Escolha um estado da lista.";
  const availability =
    form.availability === "" ? null : isOneOf(AVAILABILITY_OPTIONS, form.availability) ? form.availability : null;
  if (form.availability && !availability) errors.availability = "Escolha uma opção da lista.";

  const personality = Array.from(new Set(form.personality.filter((t) => isOneOf(PERSONALITY_TRAITS, t))));
  if (personality.length > LIMITS.maxPersonality) errors.personality = "Escolha até duas características.";

  const product: ProductDraft = {
    name: clip("name", form.name),
    brand: clip("brand", form.brand),
    short_description: clip("short_description", form.short_description),
    personality: personality.slice(0, LIMITS.maxPersonality),
    attributes: {
      type,
      volume_ml: volume.ok ? volume.value : null,
      abv_percent: abv.ok ? abv.value : null,
      wood: clip("wood", form.wood),
      aging_months: aging.ok ? aging.value : null,
      aroma: clip("aroma", form.aroma),
      flavor: clip("flavor", form.flavor),
    },
    story: clip("story", form.story),
    differentiator: clip("differentiator", form.differentiator),
    price_brl_cents: price.ok ? price.cents : null,
    min_order_units: minOrder.ok ? minOrder.value : null,
    availability,
    notes: clip("notes", form.notes),
  };
  const store: StoreOrigin = {
    producer_name: clip("producer_name", form.producer_name),
    city: clip("city", form.city),
    state,
    region: clip("region", form.region),
  };

  // Defesa em profundidade: o mesmo esquema que o servidor aplica.
  const valid = ProductDraft.safeParse(product).success && StoreOrigin.safeParse(store).success;
  return { ok: valid && Object.keys(errors).length === 0, product, store, errors };
}

export function draftToForm(product: ProductDraft | null, store: StoreOrigin | null): ProductForm {
  const a = product?.attributes;
  return {
    name: product?.name ?? "",
    brand: product?.brand ?? "",
    short_description: product?.short_description ?? "",
    personality: product?.personality ?? [],
    type: a?.type ?? "",
    volume_ml: a?.volume_ml?.toString() ?? "",
    abv_percent: a?.abv_percent?.toString().replace(".", ",") ?? "",
    wood: a?.wood ?? "",
    aging_months: a?.aging_months?.toString() ?? "",
    aroma: a?.aroma ?? "",
    flavor: a?.flavor ?? "",
    producer_name: store?.producer_name ?? "",
    city: store?.city ?? "",
    state: store?.state ?? "",
    region: store?.region ?? "",
    story: product?.story ?? "",
    differentiator: product?.differentiator ?? "",
    price: centsToBrlInput(product?.price_brl_cents ?? null),
    min_order_units: product?.min_order_units?.toString() ?? "",
    availability: product?.availability ?? "",
    notes: product?.notes ?? "",
  };
}
