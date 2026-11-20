import { z } from "zod";
import { tidyZh } from "./zh-text";
import { checkNumbers, detectScript, isMostlyChinese, isMostlyLatin, meaningWarnings, type ReplyLang } from "@/modules/messaging/text";

/**
 * Operações 2 e 3 · Interpretar a consulta e traduzir a resposta.
 *
 * A IA explica linguagem e intenção. Valores técnicos e comerciais (volume,
 * teor, preço, pedido mínimo) vêm da versão publicada que o comprador abriu e
 * são exibidos pela aplicação. Nenhuma saída tem poder de enviar mensagem.
 */
export const INTERPRET_PROMPT_VERSION = "interpret-v4";
export const INTERPRET_SCHEMA_VERSION = "interpret-output-v1";
export const TRANSLATE_PROMPT_VERSION = "translate-v2";
export const TRANSLATE_SCHEMA_VERSION = "translate-output-v1";

// ---------------------------------------------------------------------------
// Fatos da versão consultada
// ---------------------------------------------------------------------------

/** Campos da ficha publicada que a análise pode citar como disponíveis. */
export const FACT_KEYS = [
  "type",
  "volume_ml",
  "abv_percent",
  "wood",
  "aging_months",
  "aroma",
  "flavor",
  "min_order_units",
  "availability",
  "price",
] as const;
export type FactKey = (typeof FACT_KEYS)[number];

/** Fatos presentes na versão, já no formato que a IA lê (valores do produtor). */
export type ProductFacts = Partial<Record<FactKey, string>>;

/** Assuntos que o produtor precisa confirmar antes de responder com segurança. */
export const PENDING_TOPICS = ["capacity", "freight", "price", "min_order", "samples", "documents", "payment", "other"] as const;
export type PendingTopic = (typeof PENDING_TOPICS)[number];

export const INTENTS = ["price", "quantity", "delivery", "samples", "specs", "availability", "payment", "documents", "other"] as const;
export type Intent = (typeof INTENTS)[number];

// ---------------------------------------------------------------------------
// Operação 2 · Interpretar
// ---------------------------------------------------------------------------

export type InterpretInput = {
  message: string;
  /** Até 6 entradas anteriores, já em português, para contexto. */
  history: Array<{ author: "buyer" | "producer"; text_pt: string }>;
  product: { name: string; original_name: string; facts: ProductFacts };
};

const ptText = (max: number, min = 2) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((t) => isMostlyLatin(t), "Texto deveria estar em português");

export const InterpretOutput = z
  .object({
    language: z.enum(["zh-Hans", "en", "pt-BR", "other"]),
    translation_pt: ptText(6000, 1),
    summary_pt: ptText(320),
    intents: z.array(z.enum(INTENTS)).min(1).max(5),
    quantities: z
      .array(
        z
          .object({
            value: z.number().min(0),
            unit_pt: z.string().trim().min(1).max(40),
            source_text: z.string().trim().min(1).max(60),
          })
          .strict(),
      )
      .max(5),
    available_facts: z.array(z.enum(FACT_KEYS)).max(FACT_KEYS.length),
    missing: z
      .array(z.object({ topic: z.enum(PENDING_TOPICS), note_pt: ptText(240) }).strict())
      .max(6),
    next_step_pt: ptText(240),
    suggested_reply_pt: ptText(500, 10),
    cultural_note_pt: ptText(300).nullable(),
  })
  .strict();
export type InterpretOutput = z.infer<typeof InterpretOutput>;

export type ContractResult<T> = { ok: true; output: T } | { ok: false; issues: string[] };

function zodIssues(error: z.ZodError) {
  return error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(raiz)"}: ${i.message}`);
}

/**
 * Valida a análise: idioma coerente com a escrita, números da pergunta
 * preservados na tradução, fatos citados presentes na versão e sugestão sem
 * números que não estejam na pergunta ou na ficha.
 */
export function validateInterpretOutput(raw: unknown, input: InterpretInput): ContractResult<InterpretOutput> {
  const parsed = InterpretOutput.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };
  const output = parsed.data;
  const issues: string[] = [];

  const script = detectScript(input.message);
  if (script === "zh-Hans" && output.language !== "zh-Hans") issues.push("language: a mensagem está em chinês");
  // Escrita latina pode ser chinês em pinyin; o inverso (hanzi classificado como outro idioma) é recusado.

  if (output.language !== "pt-BR") {
    const numbers = checkNumbers(
      { text: input.message, style: "intl" },
      { text: output.translation_pt, style: "pt" },
    );
    if (!numbers.ok) {
      issues.push(`translation_pt: números alterados (faltam ${numbers.missing.join(", ") || "-"}; novos ${numbers.added.join(", ") || "-"})`);
    }
  }

  const present = new Set(Object.keys(input.product.facts));
  const unknown = output.available_facts.filter((key) => !present.has(key));
  if (unknown.length > 0) issues.push(`available_facts: campos ausentes na ficha (${unknown.join(", ")})`);

  const factText = Object.values(input.product.facts).join(" ");
  const suggestion = checkNumbers(
    { text: `${input.message} ${factText}`, style: "intl" },
    { text: output.suggested_reply_pt, style: "pt" },
  );
  if (!suggestion.ok && suggestion.added.length > 0) {
    issues.push(`suggested_reply_pt: números fora da pergunta e da ficha (${suggestion.added.join(", ")})`);
  }

  return issues.length === 0 ? { ok: true, output } : { ok: false, issues };
}

/**
 * Pendências exibidas ao produtor: as apontadas pela IA mais as regras fixas
 * da demonstração (a ficha não tem capacidade de produção nem frete; o preço
 * publicado é só referência).
 */
export function pendingFor(output: InterpretOutput, facts: ProductFacts): Array<{ topic: PendingTopic; note_pt: string }> {
  const result = new Map<PendingTopic, string>();
  for (const item of output.missing) if (!result.has(item.topic)) result.set(item.topic, item.note_pt);
  const quantity = output.quantities[0];
  if (output.intents.includes("quantity") && !result.has("capacity")) {
    result.set(
      "capacity",
      quantity
        ? `Confirmar se a produção atende ${quantity.source_text} no prazo desejado.`
        : "Confirmar a capacidade de produção para a quantidade pedida.",
    );
  }
  if (output.intents.includes("delivery") && !result.has("freight")) {
    result.set("freight", "Confirmar frete, prazo e condições de entrega até o destino informado.");
  }
  if (output.intents.includes("price") && !result.has("price")) {
    result.set(
      "price",
      facts.price
        ? "O preço publicado é só referência: confirmar o valor final para esta quantidade."
        : "A ficha não tem preço de referência: informar o valor ou pedir mais detalhes.",
    );
  }
  return [...result].map(([topic, note_pt]) => ({ topic, note_pt }));
}

// ---------------------------------------------------------------------------
// Operação 3 · Traduzir a resposta
// ---------------------------------------------------------------------------

export type TranslateInput = {
  text_pt: string;
  target_lang: ReplyLang;
  /** Última entrada do comprador (original) para manter o registro e os termos. */
  context: { buyer_message: string | null; product_name: string };
};

export const TranslateOutput = z
  .object({
    target_lang: z.enum(["zh-Hans", "en"]),
    translation: z.string().trim().min(1).max(6000).transform(tidyZh),
    warnings_pt: z.array(z.string().trim().min(2).max(240)).max(4),
  })
  .strict();
export type TranslateOutput = z.infer<typeof TranslateOutput>;

/** Valida idioma-alvo, escrita da tradução e preservação dos números. */
export function validateTranslateOutput(raw: unknown, input: TranslateInput): ContractResult<TranslateOutput> {
  const parsed = TranslateOutput.safeParse(raw);
  if (!parsed.success) return { ok: false, issues: zodIssues(parsed.error) };
  const output = parsed.data;
  const issues: string[] = [];
  if (output.target_lang !== input.target_lang) issues.push("target_lang: idioma diferente do pedido");
  if (input.target_lang === "zh-Hans" && !isMostlyChinese(output.translation)) issues.push("translation: não está em chinês");
  if (input.target_lang === "en" && !isMostlyLatin(output.translation)) issues.push("translation: não está em inglês");
  const numbers = checkNumbers(
    { text: input.text_pt, style: "pt" },
    { text: output.translation, style: "intl" },
  );
  if (!numbers.ok) {
    issues.push(`translation: números alterados (faltam ${numbers.missing.join(", ") || "-"}; novos ${numbers.added.join(", ") || "-"})`);
  }
  return issues.length === 0 ? { ok: true, output } : { ok: false, issues };
}

/** Alertas finais para a revisão: os da IA mais as checagens locais. */
export function reviewWarnings(input: TranslateInput, output: TranslateOutput): string[] {
  return [...new Set([...meaningWarnings(input.text_pt, output.translation, input.target_lang), ...output.warnings_pt])].slice(0, 6);
}
