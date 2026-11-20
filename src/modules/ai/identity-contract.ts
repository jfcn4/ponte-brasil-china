import { z } from "zod";
import { tidyZh } from "./zh-text";
import { PERSONALITY_LABELS, type CachacaAttributes, type ProductDraft, type StoreOrigin } from "@/modules/products/schema";

/**
 * Operação 1 · Criar identidade e apresentação.
 *
 * Entrada: só o que descreve o produto (fonte em português). Preço, pedido
 * mínimo, disponibilidade e observações nunca vão para a IA: valores
 * comerciais são resolvidos pela aplicação a partir do cadastro.
 *
 * Saída: três nomes (fonética, semântica, equilibrada) com explicações em
 * português, recomendação justificada e textos chineses da vitrine, cada
 * destaque ligado a um campo de origem presente na entrada. Desde a v2,
 * também uma apresentação curta da loja (store_intro), que o produtor aprova
 * ao publicar. Saídas v1 (sem store_intro) continuam válidas.
 *
 * v3: cada nome ganha `summary` (frase curta do cartão) e `commercial_fit`
 * (adequação ao mercado chinês), ambos opcionais na leitura para que saídas
 * antigas continuem válidas. Vantagens e limitações vêm de gains, losses e
 * ambiguities.
 */
export const IDENTITY_PROMPT_VERSION = "identity-v5";
export const IDENTITY_SCHEMA_VERSION = "identity-output-v3";

export const STRATEGIES = ["fonetica", "semantica", "equilibrada"] as const;
export type Strategy = (typeof STRATEGIES)[number];
export const STRATEGY_LABELS: Record<Strategy, string> = {
  fonetica: "Fonética",
  semantica: "Semântica",
  equilibrada: "Equilibrada",
};

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export type AdaptationInput = {
  category: "cachaca";
  name: string;
  brand: string | null;
  short_description: string;
  personality: string[];
  attributes: CachacaAttributes;
  story: string | null;
  differentiator: string | null;
  producer: { name: string | null; city: string | null; state: string | null; region: string | null };
};

/** Recorte do cadastro enviado à IA. Exige nome e descrição (checados antes). */
export function buildAdaptationInput(product: ProductDraft, store: StoreOrigin): AdaptationInput {
  if (!product.name || !product.short_description) throw new Error("adaptation_input_incomplete");
  return {
    category: "cachaca",
    name: product.name,
    brand: product.brand,
    short_description: product.short_description,
    personality: product.personality.map((trait) => PERSONALITY_LABELS[trait]),
    attributes: product.attributes,
    story: product.story,
    differentiator: product.differentiator,
    producer: { name: store.producer_name, city: store.city, state: store.state, region: store.region },
  };
}

/** JSON com chaves ordenadas: a mesma entrada gera sempre o mesmo texto (e hash). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

// ---------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------

const CJK = /[㐀-䶿一-鿿豈-﫿]/g;
const LATIN = /[A-Za-zÀ-ÿ]/g;

function count(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

/** Texto em chinês simplificado: predominam hanzi (marcas latinas são aceitas). */
const zhText = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .refine((t) => {
      const cjk = count(t, CJK);
      return cjk >= 2 && cjk >= count(t, LATIN) * 0.5;
    }, "Texto deveria estar em chinês")
    .transform(tidyZh);

/** Explicação em português: letras latinas, sem hanzi predominando. */
const ptText = (max: number, min = 2) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((t) => count(t, LATIN) >= 2 && count(t, CJK) <= count(t, LATIN), "Texto deveria estar em português");

const TONE_OR_LETTER = /[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]/i;

export const NameOption = z
  .object({
    id: z.string().regex(/^[a-z0-9_-]{1,24}$/),
    strategy: z.enum(STRATEGIES),
    hanzi: z
      .string()
      .trim()
      .regex(/^[㐀-䶿一-鿿]{1,8}$/, "Use de 1 a 8 hanzi, sem outros caracteres"),
    pinyin: z.string().trim().min(1).max(80).regex(TONE_OR_LETTER, "Pinyin ausente"),
    /** Frase curta do cartão de comparação (ausente nas saídas anteriores à v3). */
    summary: ptText(70).optional(),
    meaning: ptText(300),
    relation_to_original: ptText(300),
    personality_link: ptText(300),
    rationale: ptText(500),
    aesthetics: ptText(300),
    pronunciation: ptText(300),
    memorability: ptText(300),
    gains: z.array(ptText(200)).min(1).max(4),
    losses: z.array(ptText(200)).max(4),
    ambiguities: z.array(ptText(200)).max(4),
    /** Como o nome tende a funcionar no mercado chinês, sem promessas (ausente antes da v3). */
    commercial_fit: ptText(300).optional(),
  })
  .strict();
export type NameOption = z.infer<typeof NameOption>;

/** Campos do cadastro que um destaque pode citar como fundamento. */
export const HIGHLIGHT_SOURCES = [
  "short_description",
  "story",
  "differentiator",
  "personality",
  "brand",
  "attributes.type",
  "attributes.volume_ml",
  "attributes.abv_percent",
  "attributes.wood",
  "attributes.aging_months",
  "attributes.aroma",
  "attributes.flavor",
  "producer.city",
  "producer.state",
  "producer.region",
] as const;
export type HighlightSource = (typeof HIGHLIGHT_SOURCES)[number];

const Bilingual = (zhMax: number, ptMax: number) => z.object({ zh: zhText(zhMax), pt: ptText(ptMax) }).strict();

/** Apresentação chinesa da loja, com a versão em português para o produtor revisar. */
export const StoreIntroText = Bilingual(160, 400);
export type StoreIntroText = z.infer<typeof StoreIntroText>;

export const IdentityOutput = z
  .object({
    options: z.array(NameOption).length(3),
    recommendation: z.object({ option_id: z.string(), reason: ptText(600, 20) }).strict(),
    content: z
      .object({
        tagline: Bilingual(60, 160),
        description: Bilingual(240, 600),
        story: Bilingual(400, 1000).nullable(),
        highlights: z
          .array(Bilingual(60, 200).extend({ source_field: z.enum(HIGHLIGHT_SOURCES) }))
          .max(3),
      })
      .strict(),
    attributes_zh: z
      .object({ wood: zhText(40).nullable(), aroma: zhText(80).nullable(), flavor: zhText(80).nullable() })
      .strict(),
    /** Apresentação da loja (produtor e origem). Ausente nas saídas v1. */
    store_intro: StoreIntroText.nullable().optional(),
  })
  .strict();
export type IdentityOutput = z.infer<typeof IdentityOutput>;

// ---------------------------------------------------------------------------
// Validação do contrato e dos fatos
// ---------------------------------------------------------------------------

function sourceValue(input: AdaptationInput, field: HighlightSource): unknown {
  if (field.startsWith("attributes.")) return input.attributes[field.slice(11) as keyof CachacaAttributes];
  if (field.startsWith("producer.")) return input.producer[field.slice(9) as keyof AdaptationInput["producer"]];
  return input[field as "short_description" | "story" | "differentiator" | "personality" | "brand"];
}

function isPresent(value: unknown) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function numbersIn(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => String(Number(n.replace(",", "."))));
}

/** Todo número citado nos textos chineses precisa existir no cadastro. */
function allowedNumbers(input: AdaptationInput): Set<string> {
  const allowed = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === "number") allowed.add(String(value));
    else if (typeof value === "string") numbersIn(value).forEach((n) => allowed.add(n));
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(input);
  return allowed;
}

export type ContractResult = { ok: true; output: IdentityOutput } | { ok: false; issues: string[] };

/**
 * Valida estrutura (Zod) e regras do contrato: três estratégias distintas,
 * recomendação existente, destaques fundamentados em campos presentes,
 * história e atributos só quando há fonte, números conferidos com o cadastro.
 */
export function validateIdentityOutput(raw: unknown, input: AdaptationInput): ContractResult {
  const parsed = IdentityOutput.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`),
    };
  }
  const output = parsed.data;
  const issues: string[] = [];

  const strategies = new Set(output.options.map((o) => o.strategy));
  if (strategies.size !== 3) issues.push("options: estratégia repetida");
  const ids = new Set(output.options.map((o) => o.id));
  if (ids.size !== 3) issues.push("options: id repetido");
  if (!ids.has(output.recommendation.option_id)) issues.push("recommendation.option_id: opção inexistente");
  const hanzi = new Set(output.options.map((o) => o.hanzi));
  if (hanzi.size !== 3) issues.push("options: nomes chineses repetidos");

  output.content.highlights.forEach((h, index) => {
    if (!isPresent(sourceValue(input, h.source_field))) {
      issues.push(`content.highlights.${index}.source_field: campo ${h.source_field} vazio no cadastro`);
    }
  });

  const hasStorySource = isPresent(input.story) || isPresent(input.differentiator);
  if (hasStorySource && !output.content.story) issues.push("content.story: ausente, mas o cadastro tem história");
  if (!hasStorySource && output.content.story) issues.push("content.story: inventada, o cadastro não tem história");

  for (const key of ["wood", "aroma", "flavor"] as const) {
    const source = isPresent(input.attributes[key]);
    const translated = output.attributes_zh[key] !== null;
    if (source && !translated) issues.push(`attributes_zh.${key}: ausente`);
    // Tradução de um campo vazio (ex.: aroma citado só na descrição) é descartada,
    // não reprova a geração inteira: a ficha nunca exibe atributo sem fonte.
    if (!source && translated) output.attributes_zh[key] = null;
  }

  const allowed = allowedNumbers(input);
  const zhTexts = [
    output.content.tagline.zh,
    output.content.description.zh,
    output.content.story?.zh ?? "",
    ...output.content.highlights.map((h) => h.zh),
    output.attributes_zh.wood ?? "",
    output.attributes_zh.aroma ?? "",
    output.attributes_zh.flavor ?? "",
    output.store_intro?.zh ?? "",
  ];
  const invented = [...new Set(zhTexts.flatMap(numbersIn))].filter((n) => !allowed.has(n));
  if (invented.length > 0) issues.push(`content: números fora do cadastro (${invented.slice(0, 3).join(", ")})`);

  return issues.length === 0 ? { ok: true, output } : { ok: false, issues };
}

// ---------------------------------------------------------------------------
// Esquema enviado ao provedor (saída estruturada)
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

function stripUnsupported(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripUnsupported);
  if (!node || typeof node !== "object") return node;
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "$schema" || key === "pattern" || key === "format") continue;
    out[key] = stripUnsupported(value);
  }
  return out;
}

/** JSON Schema de um contrato, sem padrões regex (a validação completa é local). */
export function jsonSchemaFor(schema: z.ZodType): JsonSchema {
  return stripUnsupported(z.toJSONSchema(schema, { io: "input" })) as JsonSchema;
}

/**
 * JSON Schema da saída da operação 1. Para o provedor, store_intro é
 * obrigatório (pode ser null); a leitura local também aceita saídas v1.
 */
export function identityResponseSchema(): JsonSchema {
  const Option = NameOption.extend({ summary: ptText(70), commercial_fit: ptText(300) });
  return jsonSchemaFor(
    IdentityOutput.extend({ options: z.array(Option).length(3), store_intro: StoreIntroText.nullable() }),
  );
}
