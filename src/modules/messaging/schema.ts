import { z } from "zod";
import type { FactKey, Intent, PendingTopic } from "@/modules/ai/messaging-contract";
import { isWellFormedSessionToken } from "@/modules/stores/token";

/**
 * Fronteiras e modelos de exibição do módulo Messaging. Sem dependências de
 * servidor: usado pelas rotas, pelos componentes e pelos testes.
 */

export const LIMITS = { body: 2000, buyerName: 80, buyerCompany: 120 } as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => (value ? value : null));

/** Segredo do link privado do comprador: mesmo formato do token de sessão (32 bytes, base64url). */
export const BuyerToken = z.string().refine((t) => isWellFormedSessionToken(t), "Token inválido");

export const MessageBody = z.string().trim().min(1, "Escreva a mensagem").max(LIMITS.body);

export const StartInquiryRequest = z
  .object({
    slug: z.string().regex(/^[a-z0-9]{10}$/),
    version: z.number().int().positive(),
    token: BuyerToken,
    clientKey: z.uuid(),
    message: MessageBody,
    name: optionalText(LIMITS.buyerName),
    company: optionalText(LIMITS.buyerCompany),
  })
  .strict();
export type StartInquiryRequest = z.infer<typeof StartInquiryRequest>;

export const BuyerMessageRequest = z.object({ clientKey: z.uuid(), message: MessageBody }).strict();

export const ReadRequest = z.object({ upToSeq: z.number().int().min(0) }).strict();

export const DraftRequest = z
  .object({ expectedRevision: z.number().int().positive().nullable(), body: z.string().trim().min(1).max(LIMITS.body) })
  .strict();

export const SendRequest = z
  .object({ draftId: z.uuid(), expectedRevision: z.number().int().positive(), confirmed: z.literal(true) })
  .strict();

export const BUYER_TOKEN_HEADER = "x-buyer-token";

// ---------------------------------------------------------------------------
// Rótulos em português (painel do produtor)
// ---------------------------------------------------------------------------

export const INTENT_LABELS: Record<Intent, string> = {
  price: "Preço",
  quantity: "Quantidade",
  delivery: "Entrega e frete",
  samples: "Amostras",
  specs: "Características do produto",
  availability: "Disponibilidade",
  payment: "Pagamento",
  documents: "Documentação",
  other: "Outro assunto",
};

export const PENDING_LABELS: Record<PendingTopic, string> = {
  capacity: "Capacidade de produção",
  freight: "Frete e prazo",
  price: "Preço final",
  min_order: "Pedido mínimo",
  samples: "Amostras",
  documents: "Documentação",
  payment: "Pagamento",
  other: "Outro ponto",
};

export const FACT_LABELS: Record<FactKey, string> = {
  type: "Tipo",
  volume_ml: "Volume",
  abv_percent: "Teor alcoólico",
  wood: "Madeira",
  aging_months: "Envelhecimento",
  aroma: "Aroma",
  flavor: "Sabor",
  min_order_units: "Pedido mínimo",
  availability: "Disponibilidade",
  price: "Preço de referência",
};

export const LANG_LABELS: Record<string, string> = {
  "zh-Hans": "chinês",
  en: "inglês",
  "pt-BR": "português",
  other: "outro idioma",
};

export const AI_ERROR_MESSAGES: Record<string, string> = {
  invalid_output: "A IA devolveu uma resposta que não passou na conferência (por exemplo, números alterados).",
  provider_error: "O serviço de IA não respondeu como esperado. Pode ser instabilidade ou limite de uso.",
  timeout: "O serviço de IA demorou demais para responder.",
  not_configured: "A IA não está configurada neste ambiente (falta a chave do Gemini no servidor).",
};

// ---------------------------------------------------------------------------
// Modelos de exibição
// ---------------------------------------------------------------------------

export type ConsultedProduct = {
  title: string;
  titleLang: "zh-Hans" | "pt-BR";
  pinyin: string | null;
  originalName: string;
  version: number;
  price: { cnyFen: number; brlCents: number } | null;
};

/** O que o comprador vê. Nunca inclui análise, tradução para o produtor ou rascunhos. */
export type BuyerConversationView = {
  product: ConsultedProduct & {
    categoryZh: string;
    producerName: string;
    imageUrl: string | null;
    showcasePath: string;
    /** Vitrine ainda publicada (pode estar numa versão mais nova). */
    available: boolean;
  };
  buyer: { name: string | null; company: string | null };
  messages: Array<
    | { id: string; seq: number; author: "buyer"; text: string; lang: string; createdAt: string }
    | {
        id: string;
        seq: number;
        author: "producer";
        text: string;
        lang: "zh-Hans" | "en";
        originalPt: string;
        createdAt: string;
      }
  >;
  awaitingReply: boolean;
};

export type ConversationListItem = {
  id: string;
  productTitle: string;
  productName: string;
  buyerLabel: string;
  preview: string;
  previewLang: string;
  lastAuthor: "buyer" | "producer";
  lastMessageAt: string;
  hasUnread: boolean;
  awaitingReply: boolean;
};

export type AnalysisView = {
  summary: string;
  intents: string[];
  quantities: Array<{ value: number; unit: string; source: string }>;
  facts: Array<{ key: FactKey; label: string; value: string }>;
  pending: Array<{ topic: PendingTopic; label: string; note: string }>;
  nextStep: string;
  suggestedReply: string;
  culturalNote: string | null;
};

export type ProducerMessageView =
  | {
      id: string;
      seq: number;
      author: "buyer";
      createdAt: string;
      original: { text: string; lang: string };
      translationPt: string | null;
      interpretation: {
        status: "pending" | "interpreting" | "ready" | "failed";
        error: string | null;
        /** Sem resultado há tempo demais: o produtor pode pedir de novo. */
        retryable: boolean;
        isTestAdapter: boolean;
      };
      analysis: AnalysisView | null;
    }
  | {
      id: string;
      seq: number;
      author: "producer";
      createdAt: string;
      textPt: string;
      translation: { text: string; lang: "zh-Hans" | "en" };
    };

export type DraftView = {
  id: string;
  revision: number;
  body: string;
  translation:
    | { status: "none" }
    | { status: "translating" }
    | { status: "failed"; error: string | null }
    | {
        status: "ready";
        revision: number;
        text: string;
        lang: "zh-Hans" | "en";
        warnings: string[];
        isTestAdapter: boolean;
      };
};

export type ConversationDetail = {
  id: string;
  product: ConsultedProduct & { id: string; currentVersion: number | null };
  buyer: { name: string | null; company: string | null };
  replyLang: "zh-Hans" | "en";
  messages: ProducerMessageView[];
  draft: DraftView | null;
  readSeq: number;
  hasUnread: boolean;
  awaitingReply: boolean;
};

export function buyerLabel(buyer: { name: string | null; company: string | null }): string {
  const parts = [buyer.name, buyer.company].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Comprador sem identificação";
}
