import "server-only";
import { logEvent } from "@/lib/log";
import { productPath } from "@/lib/public-url";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { messagingAdapter } from "@/modules/ai";
import type { AdapterResult, CallOptions, MessagingAdapter } from "@/modules/ai/adapter";
import {
  INTERPRET_PROMPT_VERSION,
  INTERPRET_SCHEMA_VERSION,
  InterpretOutput,
  TRANSLATE_PROMPT_VERSION,
  TRANSLATE_SCHEMA_VERSION,
  pendingFor,
  reviewWarnings,
  validateInterpretOutput,
  validateTranslateOutput,
  type ContractResult,
  type FactKey,
  type InterpretInput,
  type ProductFacts,
  type TranslateInput,
} from "@/modules/ai/messaging-contract";
import { TEST_MODEL } from "@/modules/ai/test-adapter";
import { PresentationSnapshot } from "@/modules/products/presentation";
import { formatBrl, formatCny } from "@/modules/products/pricing";
import { signPaths } from "@/modules/products/repository";
import { AVAILABILITY_LABELS, CACHACA_TYPE_LABELS } from "@/modules/products/schema";
import { hashSessionToken } from "@/modules/stores/token";
import {
  FACT_LABELS,
  INTENT_LABELS,
  PENDING_LABELS,
  buyerLabel,
  type AnalysisView,
  type BuyerConversationView,
  type ConsultedProduct,
  type ConversationDetail,
  type ConversationListItem,
  type DraftView,
  type ProducerMessageView,
} from "./schema";
import { REPLY_LANG, provisionalBodyLang, type ReplyLang } from "./text";

export class MessagingError extends Error {
  constructor(
    readonly code:
      | "product_not_found"
      | "product_unavailable"
      | "version_changed"
      | "token_conflict"
      | "conversation_not_found"
      | "conversation_full"
      | "message_not_found"
      | "draft_not_found"
      | "revision_conflict"
      | "translation_stale",
  ) {
    super(code);
  }
}

const KNOWN_RPC_ERRORS = [
  "product_not_found",
  "product_unavailable",
  "version_changed",
  "token_conflict",
  "conversation_not_found",
  "conversation_full",
  "draft_not_found",
  "revision_conflict",
  "translation_stale",
] as const;

function rpcError(message: string | undefined): MessagingError | null {
  if (!message) return null;
  const code = KNOWN_RPC_ERRORS.find((c) => message.includes(c));
  return code ? new MessagingError(code) : null;
}

/** Saídas inválidas aceitas antes de desistir. */
const MAX_ATTEMPTS = 2;
/** Repetições extras quando o provedor está instável (5xx, rede). */
const MAX_TRANSIENT_RETRIES = 2;
const TRANSIENT_DELAY_MS = process.env.NODE_ENV === "test" ? 0 : 1_000;
/** Sem resultado após este tempo, o produtor pode pedir a interpretação de novo. */
const STUCK_AFTER_MS = 90_000;
/** Prazo de uma operação de IA (rotas com 60 s na Vercel). */
const AI_BUDGET_MS = 50_000;
/** Nova chamada só começa com esta folga antes do prazo. */
const MIN_CALL_WINDOW_MS = 8_000;

// ---------------------------------------------------------------------------
// Linhas do banco
// ---------------------------------------------------------------------------

type ConversationRow = {
  id: string;
  store_id: string;
  product_id: string;
  presentation_id: string;
  presentation_version: number;
  buyer_name: string | null;
  buyer_company: string | null;
  reply_lang: ReplyLang;
  last_seq: number;
  last_buyer_seq: number;
  producer_read_seq: number;
  has_unread: boolean;
  awaiting_reply: boolean;
  last_message_at: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  store_id: string;
  seq: number;
  author: "buyer" | "producer";
  body: string;
  body_lang: string;
  translation: string | null;
  translation_lang: string | null;
  analysis: unknown;
  interpretation_status: "pending" | "interpreting" | "ready" | "failed" | null;
  interpretation_error: string | null;
  interpretation_model: string | null;
  interpretation_started_at: string | null;
  created_at: string;
};

type DraftRow = {
  id: string;
  conversation_id: string;
  store_id: string;
  body: string;
  revision: number;
  translation_status: "none" | "translating" | "ready" | "failed";
  translation_revision: number | null;
  translation: string | null;
  translation_lang: ReplyLang | null;
  translation_warnings: string[];
  translation_error: string | null;
  translation_model: string | null;
  translation_started_at: string | null;
  sent_message_id: string | null;
};

const CONVERSATION_COLUMNS =
  "id, store_id, product_id, presentation_id, presentation_version, buyer_name, buyer_company, reply_lang, " +
  "last_seq, last_buyer_seq, producer_read_seq, has_unread, awaiting_reply, last_message_at, created_at";
const MESSAGE_COLUMNS =
  "id, conversation_id, store_id, seq, author, body, body_lang, translation, translation_lang, analysis, " +
  "interpretation_status, interpretation_error, interpretation_model, interpretation_started_at, created_at";

// ---------------------------------------------------------------------------
// Fatos da versão consultada
// ---------------------------------------------------------------------------

/** Fatos presentes na versão publicada, escritos pela aplicação (nunca pela IA). */
export function factsFromSnapshot(snapshot: PresentationSnapshot): ProductFacts {
  const a = snapshot.facts.attributes;
  const facts: ProductFacts = {};
  if (a.type) facts.type = CACHACA_TYPE_LABELS[a.type];
  if (a.volume_ml !== null) facts.volume_ml = `${a.volume_ml} mL por garrafa`;
  if (a.abv_percent !== null) facts.abv_percent = `${String(a.abv_percent).replace(".", ",")}% vol`;
  if (a.wood) facts.wood = a.wood;
  if (a.aging_months !== null) facts.aging_months = `${a.aging_months} meses`;
  if (a.aroma) facts.aroma = a.aroma;
  if (a.flavor) facts.flavor = a.flavor;
  if (snapshot.facts.min_order_units !== null) facts.min_order_units = `${snapshot.facts.min_order_units} garrafas`;
  if (snapshot.facts.availability) facts.availability = AVAILABILITY_LABELS[snapshot.facts.availability];
  if (snapshot.price) {
    facts.price = `${formatBrl(snapshot.price.brl_cents)} por garrafa (referência ${formatCny(snapshot.price.cny_fen)}, taxa demonstrativa BRL 1 = CNY ${snapshot.price.rate.replace(".", ",")})`;
  }
  return facts;
}

function consultedProduct(snapshot: PresentationSnapshot, version: number): ConsultedProduct {
  return {
    title: snapshot.name.display,
    titleLang: snapshot.name.display_lang,
    pinyin: snapshot.name.pinyin,
    originalName: snapshot.name.original,
    version,
    price: snapshot.price ? { cnyFen: snapshot.price.cny_fen, brlCents: snapshot.price.brl_cents } : null,
  };
}

async function loadSnapshot(presentationId: string): Promise<{ snapshot: PresentationSnapshot; primaryPath: string | null }> {
  const { data, error } = await supabaseAdmin()
    .from("presentations")
    .select("snapshot, presentation_images(position, storage_path)")
    .eq("id", presentationId)
    .single();
  if (error || !data) throw new Error(`presentation_read_failed: ${error?.code ?? "none"}`);
  const images = (data.presentation_images ?? []) as Array<{ position: number; storage_path: string }>;
  return {
    snapshot: PresentationSnapshot.parse(data.snapshot),
    primaryPath: images.find((img) => img.position === 0)?.storage_path ?? null,
  };
}

async function logAiCall(row: {
  operation: "interpret" | "translate";
  storeId: string;
  productId: string;
  conversationId: string;
  model: string;
  attempt: number;
  status: "ok" | "invalid_output" | "provider_error" | "timeout" | "not_configured";
  durationMs: number;
  detail?: string;
}) {
  const interpret = row.operation === "interpret";
  const { error } = await supabaseAdmin().from("ai_calls").insert({
    store_id: row.storeId,
    product_id: row.productId,
    conversation_id: row.conversationId,
    operation: row.operation,
    prompt_version: interpret ? INTERPRET_PROMPT_VERSION : TRANSLATE_PROMPT_VERSION,
    schema_version: interpret ? INTERPRET_SCHEMA_VERSION : TRANSLATE_SCHEMA_VERSION,
    model: row.model,
    attempt: row.attempt,
    status: row.status,
    duration_ms: row.durationMs,
    detail: row.detail?.slice(0, 300) ?? null,
  });
  logEvent("ai.call", {
    op: row.operation,
    conversationId: row.conversationId,
    model: row.model,
    attempt: row.attempt,
    status: row.status,
    ms: row.durationMs,
    logged: !error,
  });
}

type AiErrorCode = "invalid_output" | "provider_error" | "timeout" | "not_configured";

/** Até duas saídas inválidas e duas instabilidades do provedor; cota, tempo esgotado e configuração devolvem ao usuário. */
async function runWithContract<T>(
  call: (attempt: number, options: CallOptions) => Promise<AdapterResult>,
  validate: (raw: unknown) => ContractResult<T>,
  log: (attempt: number, status: "ok" | AiErrorCode, durationMs: number, detail?: string, model?: string) => Promise<void>,
): Promise<{ ok: true; output: T } | { ok: false; code: AiErrorCode }> {
  let code: AiErrorCode = "provider_error";
  let invalid = 0;
  let transientRetries = 0;
  const deadline = Date.now() + AI_BUDGET_MS;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS + MAX_TRANSIENT_RETRIES; attempt += 1) {
    if (attempt > 1 && deadline - Date.now() < MIN_CALL_WINDOW_MS) break;
    const started = Date.now();
    // A tentativa seguinte a uma saída inválida pede resposta mais conservadora.
    const result = await call(invalid + 1, { deadline });
    const durationMs = Date.now() - started;
    if (result.kind === "error") {
      await log(attempt, result.code, durationMs, result.detail, result.model);
      // Instabilidade passageira (5xx, rede) repete após uma pausa curta; cota, tempo esgotado e configuração, não.
      const transient = result.code === "provider_error" && /^(http_5\d\d|network:)/.test(result.detail);
      if (transient && transientRetries < MAX_TRANSIENT_RETRIES) {
        transientRetries += 1;
        code = result.code;
        await new Promise((resolve) => setTimeout(resolve, TRANSIENT_DELAY_MS));
        continue;
      }
      return { ok: false, code: result.code };
    }
    const checked = validate(result.raw);
    if (checked.ok) {
      await log(attempt, "ok", durationMs, result.detail, result.model);
      return { ok: true, output: checked.output };
    }
    code = "invalid_output";
    invalid += 1;
    await log(attempt, "invalid_output", durationMs, checked.issues.join(" | "), result.model);
    if (invalid >= MAX_ATTEMPTS) break;
  }
  return { ok: false, code };
}

// ---------------------------------------------------------------------------
// Comprador (sem sessão; o segredo do link privado autoriza uma conversa)
// ---------------------------------------------------------------------------

export async function startConversation(request: {
  slug: string;
  version: number;
  token: string;
  clientKey: string;
  message: string;
  name: string | null;
  company: string | null;
}): Promise<{ conversationId: string; messageId: string; storeId: string; created: boolean }> {
  const tokenHash = await hashSessionToken(request.token);
  const { data, error } = await supabaseAdmin().rpc("start_conversation", {
    p_slug: request.slug,
    p_presentation_version: request.version,
    p_token_hash: tokenHash,
    p_body: request.message,
    p_body_lang: provisionalBodyLang(request.message),
    p_reply_lang: REPLY_LANG,
    p_buyer_name: request.name,
    p_buyer_company: request.company,
    p_client_key: request.clientKey,
  });
  if (error) {
    const mapped = rpcError(error.message);
    logEvent("conversation.start_failed", { code: mapped?.code ?? error.code });
    if (mapped) throw mapped;
    throw new Error(`conversation_start_failed: ${error.code}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { conversation_id: string; message_id: string; created: boolean }
    | undefined;
  if (!row) throw new Error("conversation_start_failed: no_row");
  const { data: conversation } = await supabaseAdmin()
    .from("conversations")
    .select("store_id")
    .eq("id", row.conversation_id)
    .single();
  logEvent("conversation.started", { conversationId: row.conversation_id, messageId: row.message_id, created: row.created });
  return { conversationId: row.conversation_id, messageId: row.message_id, storeId: conversation!.store_id, created: row.created };
}

export async function addBuyerMessage(
  token: string,
  request: { clientKey: string; message: string },
): Promise<{ conversationId: string; messageId: string; storeId: string; created: boolean }> {
  const tokenHash = await hashSessionToken(token);
  const { data, error } = await supabaseAdmin().rpc("add_buyer_message", {
    p_token_hash: tokenHash,
    p_body: request.message,
    p_body_lang: provisionalBodyLang(request.message),
    p_reply_lang: REPLY_LANG,
    p_client_key: request.clientKey,
  });
  if (error) {
    const mapped = rpcError(error.message);
    if (mapped) throw mapped;
    throw new Error(`buyer_message_failed: ${error.code}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { conversation_id: string; message_id: string; created: boolean }
    | undefined;
  if (!row) throw new Error("buyer_message_failed: no_row");
  const { data: conversation } = await supabaseAdmin()
    .from("conversations")
    .select("store_id")
    .eq("id", row.conversation_id)
    .single();
  logEvent("conversation.buyer_message", { conversationId: row.conversation_id, messageId: row.message_id, created: row.created });
  return { conversationId: row.conversation_id, messageId: row.message_id, storeId: conversation!.store_id, created: row.created };
}

/** Conversa vista pelo comprador: suas entradas e as respostas confirmadas. */
export async function getBuyerConversation(token: string): Promise<BuyerConversationView | null> {
  const db = supabaseAdmin();
  const tokenHash = await hashSessionToken(token);
  const { data, error } = await db
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("buyer_token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(`conversation_read_failed: ${error.code}`);
  if (!data) return null;
  const conversation = data as unknown as ConversationRow;

  const [{ data: rows, error: messagesError }, consulted, { data: product }] = await Promise.all([
    db
      .from("messages")
      .select("id, seq, author, body, body_lang, translation, translation_lang, created_at")
      .eq("conversation_id", conversation.id)
      .order("seq", { ascending: true }),
    loadSnapshot(conversation.presentation_id),
    db.from("products").select("public_slug, published_presentation_id").eq("id", conversation.product_id).single(),
  ]);
  if (messagesError) throw new Error(`messages_read_failed: ${messagesError.code}`);
  const urls = await signPaths(consulted.primaryPath ? [consulted.primaryPath] : []);

  return {
    product: {
      ...consultedProduct(consulted.snapshot, conversation.presentation_version),
      categoryZh: consulted.snapshot.category_zh,
      producerName: consulted.snapshot.producer.name,
      imageUrl: consulted.primaryPath ? (urls.get(consulted.primaryPath) ?? null) : null,
      showcasePath: productPath(product!.public_slug as string),
      available: Boolean(product?.published_presentation_id),
    },
    buyer: { name: conversation.buyer_name, company: conversation.buyer_company },
    messages: ((rows ?? []) as Array<Pick<MessageRow, "id" | "seq" | "author" | "body" | "body_lang" | "translation" | "translation_lang" | "created_at">>).map(
      (m) =>
        m.author === "buyer"
          ? { id: m.id, seq: m.seq, author: "buyer" as const, text: m.body, lang: m.body_lang, createdAt: m.created_at }
          : {
              id: m.id,
              seq: m.seq,
              author: "producer" as const,
              text: m.translation!,
              lang: m.translation_lang as ReplyLang,
              originalPt: m.body,
              createdAt: m.created_at,
            },
    ),
    awaitingReply: conversation.awaiting_reply,
  };
}

// ---------------------------------------------------------------------------
// Operação 2 · Interpretar a entrada (original já salvo)
// ---------------------------------------------------------------------------

/**
 * Interpreta uma entrada do comprador. Reserva a mensagem antes da chamada
 * (evita duas em paralelo), valida o contrato e grava tradução e análise.
 * Falha mantém o original e permite repetir.
 */
export async function interpretMessage(
  storeId: string,
  messageId: string,
  adapter: MessagingAdapter = messagingAdapter(),
): Promise<"ready" | "failed" | "skipped"> {
  const db = supabaseAdmin();
  const { data: messageData, error } = await db
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("id", messageId)
    .eq("store_id", storeId)
    .eq("author", "buyer")
    .maybeSingle();
  if (error) throw new Error(`message_read_failed: ${error.code}`);
  if (!messageData) throw new MessagingError("message_not_found");
  const message = messageData as unknown as MessageRow;

  const { data: claimed, error: claimError } = await db.rpc("claim_interpretation", {
    p_store_id: storeId,
    p_message_id: messageId,
    p_model: adapter.model,
  });
  if (claimError) throw new Error(`interpretation_claim_failed: ${claimError.code}`);
  if (claimed !== true) return "skipped";

  const { data: conversationData } = await db
    .from("conversations")
    .select("id, product_id, presentation_id")
    .eq("id", message.conversation_id)
    .single();
  const conversation = conversationData as { id: string; product_id: string; presentation_id: string };

  let result: Awaited<ReturnType<typeof runWithContract<InterpretOutput>>>;
  try {
    const [{ snapshot }, { data: previous }] = await Promise.all([
      loadSnapshot(conversation.presentation_id),
      db
        .from("messages")
        .select("author, body, translation, interpretation_status")
        .eq("conversation_id", conversation.id)
        .lt("seq", message.seq)
        .order("seq", { ascending: false })
        .limit(6),
    ]);
    const history = ((previous ?? []) as Array<Pick<MessageRow, "author" | "body" | "translation" | "interpretation_status">>)
      .reverse()
      .flatMap((m): InterpretInput["history"] => {
        if (m.author === "producer") return [{ author: "producer", text_pt: m.body }];
        return m.translation ? [{ author: "buyer", text_pt: m.translation }] : [];
      });
    const input: InterpretInput = {
      message: message.body,
      history,
      product: { name: snapshot.name.display, original_name: snapshot.name.original, facts: factsFromSnapshot(snapshot) },
    };
    result = await runWithContract(
      (attempt, options) => adapter.interpretInquiry(input, attempt, options),
      (raw) => validateInterpretOutput(raw, input),
      (attempt, status, durationMs, detail, model) =>
        logAiCall({
          operation: "interpret",
          storeId,
          productId: conversation.product_id,
          conversationId: conversation.id,
          model: model ?? adapter.model,
          attempt,
          status,
          durationMs,
          detail,
        }),
    );
  } catch (cause) {
    result = { ok: false, code: "provider_error" };
    logEvent("interpretation.crashed", { messageId, message: cause instanceof Error ? cause.message.slice(0, 80) : "unknown" });
  }

  const update = result.ok
    ? {
        interpretation_status: "ready",
        interpretation_error: null,
        translation: result.output.translation_pt,
        translation_lang: "pt-BR",
        body_lang: result.output.language,
        analysis: result.output,
      }
    : { interpretation_status: "failed", interpretation_error: result.code };
  const { error: finishError } = await db
    .from("messages")
    .update(update)
    .eq("id", messageId)
    .eq("store_id", storeId)
    .eq("interpretation_status", "interpreting");
  if (finishError) logEvent("interpretation.finish_failed", { messageId, code: finishError.code });

  logEvent("interpretation.finished", { conversationId: conversation.id, messageId, status: result.ok ? "ready" : "failed" });
  return result.ok ? "ready" : "failed";
}

// ---------------------------------------------------------------------------
// Produtor (sessão da loja; todo acesso filtrado pela loja)
// ---------------------------------------------------------------------------

async function ownedConversation(storeId: string, conversationId: string): Promise<ConversationRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(`conversation_read_failed: ${error.code}`);
  return (data as unknown as ConversationRow | null) ?? null;
}

export async function countUnreadConversations(storeId: string): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from("conversations")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("has_unread", true);
  if (error) throw new Error(`conversations_count_failed: ${error.code}`);
  return count ?? 0;
}

export async function listConversations(storeId: string): Promise<ConversationListItem[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("conversations")
    .select(`${CONVERSATION_COLUMNS}, presentations!conversations_presentation_id_product_id_fkey(snapshot)`)
    .eq("store_id", storeId)
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`conversations_list_failed: ${error.code}`);
  const rows = (data ?? []) as unknown as Array<ConversationRow & { presentations: { snapshot: unknown } | null }>;
  if (rows.length === 0) return [];

  // Última mensagem de cada conversa (seq = last_seq).
  const { data: lastRows, error: lastError } = await db
    .from("messages")
    .select("conversation_id, seq, author, body, body_lang, translation")
    .in("conversation_id", rows.map((r) => r.id))
    .order("seq", { ascending: false })
    .limit(500);
  if (lastError) throw new Error(`messages_list_failed: ${lastError.code}`);
  const last = new Map<string, Pick<MessageRow, "author" | "body" | "body_lang" | "translation">>();
  for (const m of (lastRows ?? []) as Array<MessageRow>) if (!last.has(m.conversation_id)) last.set(m.conversation_id, m);

  return rows.map((row) => {
    const snapshot = PresentationSnapshot.safeParse(row.presentations?.snapshot);
    const message = last.get(row.id);
    const useTranslation = message?.author === "buyer" && message.translation;
    return {
      id: row.id,
      productTitle: snapshot.success ? snapshot.data.name.display : "Produto",
      productName: snapshot.success ? snapshot.data.name.original : "",
      buyerLabel: buyerLabel({ name: row.buyer_name, company: row.buyer_company }),
      preview: (useTranslation ? message!.translation! : (message?.body ?? "")).slice(0, 160),
      previewLang: useTranslation || message?.author === "producer" ? "pt-BR" : (message?.body_lang ?? "und"),
      lastAuthor: message?.author ?? "buyer",
      lastMessageAt: row.last_message_at,
      hasUnread: row.has_unread,
      awaitingReply: row.awaiting_reply,
    };
  });
}

function analysisView(raw: unknown, facts: ProductFacts): AnalysisView | null {
  const parsed = InterpretOutput.safeParse(raw);
  if (!parsed.success) return null;
  const a = parsed.data;
  return {
    summary: a.summary_pt,
    intents: a.intents.map((intent) => INTENT_LABELS[intent]),
    quantities: a.quantities.map((q) => ({ value: q.value, unit: q.unit_pt, source: q.source_text })),
    // Valores pela aplicação, a partir da versão consultada.
    facts: a.available_facts
      .filter((key): key is FactKey => facts[key] !== undefined)
      .map((key) => ({ key, label: FACT_LABELS[key], value: facts[key]! })),
    pending: pendingFor(a, facts).map((p) => ({ topic: p.topic, label: PENDING_LABELS[p.topic], note: p.note_pt })),
    nextStep: a.next_step_pt,
    suggestedReply: a.suggested_reply_pt,
    culturalNote: a.cultural_note_pt,
  };
}

function draftView(row: DraftRow | null): DraftView | null {
  if (!row) return null;
  let translation: DraftView["translation"] = { status: "none" };
  if (row.translation_status === "translating") translation = { status: "translating" };
  if (row.translation_status === "failed") translation = { status: "failed", error: row.translation_error };
  // Prévia em outro idioma (anterior à regra "sempre chinês") não vale: será refeita.
  if (
    row.translation_status === "ready" &&
    row.translation_revision === row.revision &&
    row.translation &&
    row.translation_lang === REPLY_LANG
  ) {
    translation = {
      status: "ready",
      revision: row.translation_revision,
      text: row.translation,
      lang: row.translation_lang,
      warnings: row.translation_warnings ?? [],
      isTestAdapter: row.translation_model === TEST_MODEL,
    };
  }
  return { id: row.id, revision: row.revision, body: row.body, translation };
}

async function openDraft(conversationId: string): Promise<DraftRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("reply_drafts")
    .select("*")
    .eq("conversation_id", conversationId)
    .is("sent_message_id", null)
    .maybeSingle();
  if (error) throw new Error(`draft_read_failed: ${error.code}`);
  return (data as DraftRow | null) ?? null;
}

export async function getConversationDetail(storeId: string, conversationId: string): Promise<ConversationDetail | null> {
  const conversation = await ownedConversation(storeId, conversationId);
  if (!conversation) return null;
  const db = supabaseAdmin();
  const [{ data: rows, error }, consulted, { data: product }, draft] = await Promise.all([
    db.from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", conversationId).order("seq", { ascending: true }),
    loadSnapshot(conversation.presentation_id),
    db
      .from("products")
      .select("id, current:presentations!products_published_presentation_fkey(version)")
      .eq("id", conversation.product_id)
      .single(),
    openDraft(conversationId),
  ]);
  if (error) throw new Error(`messages_read_failed: ${error.code}`);
  const facts = factsFromSnapshot(consulted.snapshot);
  const now = Date.now();

  const messages: ProducerMessageView[] = ((rows ?? []) as unknown as MessageRow[]).map((m) => {
    if (m.author === "producer") {
      return {
        id: m.id,
        seq: m.seq,
        author: "producer",
        createdAt: m.created_at,
        textPt: m.body,
        translation: { text: m.translation!, lang: m.translation_lang as ReplyLang },
      };
    }
    const status = m.interpretation_status ?? "pending";
    const since = Date.parse(m.interpretation_started_at ?? m.created_at);
    return {
      id: m.id,
      seq: m.seq,
      author: "buyer",
      createdAt: m.created_at,
      original: { text: m.body, lang: m.body_lang },
      translationPt: status === "ready" ? m.translation : null,
      interpretation: {
        status,
        error: m.interpretation_error,
        retryable: status === "failed" || (status !== "ready" && now - since > STUCK_AFTER_MS),
        isTestAdapter: m.interpretation_model === TEST_MODEL,
      },
      analysis: status === "ready" ? analysisView(m.analysis, facts) : null,
    };
  });

  const current = (product as unknown as { current: { version: number } | null } | null)?.current ?? null;
  return {
    id: conversation.id,
    product: {
      ...consultedProduct(consulted.snapshot, conversation.presentation_version),
      id: conversation.product_id,
      currentVersion: current?.version ?? null,
    },
    buyer: { name: conversation.buyer_name, company: conversation.buyer_company },
    replyLang: REPLY_LANG,
    messages,
    draft: draftView(draft),
    readSeq: conversation.producer_read_seq,
    hasUnread: conversation.has_unread,
    awaitingReply: conversation.awaiting_reply,
  };
}

/** Marca como lidas as entradas até a última exibida (não as que chegaram depois). */
export async function markConversationRead(storeId: string, conversationId: string, upToSeq: number): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc("mark_conversation_read", {
    p_store_id: storeId,
    p_conversation_id: conversationId,
    p_up_to_seq: upToSeq,
  });
  if (error) {
    const mapped = rpcError(error.message);
    if (mapped) throw mapped;
    throw new Error(`conversation_read_mark_failed: ${error.code}`);
  }
  return data as number;
}

/** Pede de novo a interpretação de uma entrada que falhou ou ficou presa. */
export async function retryInterpretation(
  storeId: string,
  conversationId: string,
  messageId: string,
  adapter?: MessagingAdapter,
): Promise<"ready" | "failed" | "skipped"> {
  const { data, error } = await supabaseAdmin()
    .from("messages")
    .select("id")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(`message_read_failed: ${error.code}`);
  if (!data) throw new MessagingError("message_not_found");
  return interpretMessage(storeId, messageId, adapter);
}

// ---------------------------------------------------------------------------
// Resposta: rascunho, tradução revisada e envio confirmado
// ---------------------------------------------------------------------------

export async function saveReplyDraft(
  storeId: string,
  conversationId: string,
  expectedRevision: number | null,
  body: string,
): Promise<DraftView> {
  const { data, error } = await supabaseAdmin().rpc("save_reply_draft", {
    p_store_id: storeId,
    p_conversation_id: conversationId,
    p_expected_revision: expectedRevision,
    p_body: body,
  });
  if (error) {
    const mapped = rpcError(error.message);
    if (mapped) throw mapped;
    throw new Error(`draft_save_failed: ${error.code}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as DraftRow | undefined;
  if (!row) throw new Error("draft_save_failed: no_row");
  return draftView(row)!;
}

/**
 * Grava o texto em português e traduz essa revisão exata para o idioma da
 * conversa. Se o texto mudar durante a chamada, o retorno é descartado.
 * Falha mantém o texto e permite repetir.
 */
export async function translateReplyDraft(
  storeId: string,
  conversationId: string,
  expectedRevision: number | null,
  body: string,
  adapter: MessagingAdapter = messagingAdapter(),
): Promise<{ draft: DraftView; outcome: "ready" | "failed" | "busy" | "stale" }> {
  const conversation = await ownedConversation(storeId, conversationId);
  if (!conversation) throw new MessagingError("conversation_not_found");
  const saved = await saveReplyDraft(storeId, conversationId, expectedRevision, body);
  if (saved.translation.status === "ready") return { draft: saved, outcome: "ready" };

  const db = supabaseAdmin();
  // Prévia pronta em outro idioma (anterior à regra "sempre chinês"): libera para traduzir de novo.
  await db
    .from("reply_drafts")
    .update({ translation_status: "none", translation_revision: null, translation: null, translation_lang: null, translation_warnings: [] })
    .eq("id", saved.id)
    .eq("store_id", storeId)
    .eq("translation_status", "ready")
    .neq("translation_lang", REPLY_LANG);
  const { data: claimed, error: claimError } = await db.rpc("claim_reply_translation", {
    p_store_id: storeId,
    p_draft_id: saved.id,
    p_revision: saved.revision,
    p_model: adapter.model,
  });
  if (claimError) throw new Error(`translation_claim_failed: ${claimError.code}`);
  if (claimed !== true) {
    // O texto mudou antes da reserva (retorno seria obsoleto) ou outra tradução está em andamento.
    const latest = draftView(await openDraft(conversationId));
    return { draft: latest ?? saved, outcome: latest && latest.revision !== saved.revision ? "stale" : "busy" };
  }

  let result: Awaited<ReturnType<typeof runWithContract<{ translation: string; warnings: string[] }>>>;
  try {
    const [{ snapshot }, { data: lastBuyer }] = await Promise.all([
      loadSnapshot(conversation.presentation_id),
      db
        .from("messages")
        .select("body")
        .eq("conversation_id", conversationId)
        .eq("author", "buyer")
        .order("seq", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const input: TranslateInput = {
      text_pt: saved.body,
      target_lang: REPLY_LANG,
      context: { buyer_message: (lastBuyer?.body as string | undefined) ?? null, product_name: snapshot.name.display },
    };
    result = await runWithContract(
      (attempt, options) => adapter.translateReply(input, attempt, options),
      (raw) => {
        const checked = validateTranslateOutput(raw, input);
        return checked.ok
          ? { ok: true, output: { translation: checked.output.translation, warnings: reviewWarnings(input, checked.output) } }
          : checked;
      },
      (attempt, status, durationMs, detail, model) =>
        logAiCall({
          operation: "translate",
          storeId,
          productId: conversation.product_id,
          conversationId,
          model: model ?? adapter.model,
          attempt,
          status,
          durationMs,
          detail,
        }),
    );
  } catch (cause) {
    result = { ok: false, code: "provider_error" };
    logEvent("translation.crashed", { conversationId, message: cause instanceof Error ? cause.message.slice(0, 80) : "unknown" });
  }

  const { data: finished, error: finishError } = await db.rpc("finish_reply_translation", {
    p_store_id: storeId,
    p_draft_id: saved.id,
    p_revision: saved.revision,
    p_translation: result.ok ? result.output.translation : null,
    p_translation_lang: result.ok ? REPLY_LANG : null,
    p_warnings: result.ok ? result.output.warnings : [],
    p_error: result.ok ? null : result.code,
  });
  if (finishError) throw new Error(`translation_finish_failed: ${finishError.code}`);

  logEvent("translation.finished", {
    conversationId,
    draftId: saved.id,
    revision: saved.revision,
    status: finished !== true ? "stale" : result.ok ? "ready" : "failed",
  });
  const draft = draftView(await openDraft(conversationId)) ?? saved;
  if (finished !== true) return { draft, outcome: "stale" };
  return { draft, outcome: result.ok ? "ready" : "failed" };
}

/** Envio confirmado. Repetir a confirmação do mesmo rascunho não duplica a mensagem. */
export async function sendReply(
  storeId: string,
  conversationId: string,
  request: { draftId: string; expectedRevision: number },
): Promise<{ messageId: string; seq: number; created: boolean }> {
  const started = Date.now();
  // A tradução revisada precisa estar em chinês (regra de todas as respostas).
  const { data: draft } = await supabaseAdmin()
    .from("reply_drafts")
    .select("translation_lang, sent_message_id")
    .eq("id", request.draftId)
    .eq("conversation_id", conversationId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (draft && !draft.sent_message_id && draft.translation_lang && draft.translation_lang !== REPLY_LANG) {
    throw new MessagingError("translation_stale");
  }
  const { data, error } = await supabaseAdmin().rpc("send_reply", {
    p_store_id: storeId,
    p_conversation_id: conversationId,
    p_draft_id: request.draftId,
    p_expected_revision: request.expectedRevision,
  });
  if (error) {
    const mapped = rpcError(error.message);
    logEvent("reply.send_failed", { conversationId, draftId: request.draftId, code: mapped?.code ?? error.code });
    if (mapped) throw mapped;
    throw new Error(`reply_send_failed: ${error.code}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as { message_id: string; seq: number; created: boolean } | undefined;
  if (!row) throw new Error("reply_send_failed: no_row");
  logEvent("reply.sent", {
    conversationId,
    draftId: request.draftId,
    messageId: row.message_id,
    seq: row.seq,
    created: row.created,
    ms: Date.now() - started,
  });
  return { messageId: row.message_id, seq: row.seq, created: row.created };
}
