/**
 * Conversas contra o Supabase de .env.local, com o adaptador de IA de teste.
 * Cobre T01 (isolamento de lojas e compradores), T07 (original salvo antes da
 * IA, falha e repetição), T08 (sugestão, edição invalida tradução, envio
 * único, inglês), T09 (badge e leitura só do que foi exibido) e T10 (conversa
 * presa à versão, vitrine republicada e retirada).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AdapterResult, MessagingAdapter } from "@/modules/ai/adapter";
import { createTestAdapter, createTestMessagingAdapter } from "@/modules/ai/test-adapter";
import {
  MessagingError,
  addBuyerMessage,
  countUnreadConversations,
  getBuyerConversation,
  getConversationDetail,
  interpretMessage,
  listConversations,
  markConversationRead,
  retryInterpretation,
  saveReplyDraft,
  sendReply,
  startConversation,
  translateReplyDraft,
} from "@/modules/messaging/service";
import { EMPTY_FORM, formToDraft } from "@/modules/products/form";
import { generateAdaptation, getLabState, publishProduct } from "@/modules/products/publication";
import { addImage, getProductForEdit, saveDraft } from "@/modules/products/repository";
import { ensureStoreForToken } from "@/modules/stores/session";
import { generateSessionToken } from "@/modules/stores/token";

const JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
    "base64",
  ),
);
const bucket = process.env.SUPABASE_STORAGE_BUCKET!;
const createdStores: string[] = [];

const SHANGHAI = "您好！请问你们能供应500瓶吗？可以送到上海吗？";

const BASE_FORM = {
  ...EMPTY_FORM,
  name: "Cachaça Conversa",
  short_description: "Cachaça de alambique envelhecida em amburana.",
  volume_ml: "700",
  abv_percent: "40",
  producer_name: "Engenho Conversa",
  city: "Salinas",
  state: "MG",
  price: "79,00",
};

function draftOf(overrides: Partial<typeof EMPTY_FORM> = {}) {
  const result = formToDraft({ ...BASE_FORM, ...overrides });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return { product: result.product, store: result.store };
}

async function publish(storeId: string, productId: string) {
  const current = await getProductForEdit(storeId, productId);
  await generateAdaptation(storeId, productId, current!.product.revision, createTestAdapter());
  const lab = await getLabState(storeId, productId);
  return publishProduct(storeId, productId, {
    adaptationId: lab!.usable!.id,
    choice: "semantica",
    expectedRevision: lab!.product.revision,
    expectedMediaRevision: lab!.product.mediaRevision,
  });
}

/** Loja com um produto publicado (versão 1). */
async function publishedShop(overrides: Partial<typeof EMPTY_FORM> = {}) {
  const storeId = await ensureStoreForToken(generateSessionToken());
  createdStores.push(storeId);
  const saved = await saveDraft(storeId, null, { expectedRevision: null, ...draftOf(overrides) });
  await addImage(storeId, saved.id, { bytes: JPEG, contentType: "image/jpeg", width: 1, height: 1 });
  const published = await publish(storeId, saved.id);
  return { storeId, productId: saved.id, slug: published.slug, version: published.version };
}

async function inquire(slug: string, version: number, message = SHANGHAI, extra: { name?: string } = {}) {
  const token = generateSessionToken();
  const clientKey = crypto.randomUUID();
  const started = await startConversation({ slug, version, token, clientKey, message, name: extra.name ?? null, company: null });
  return { ...started, token, clientKey };
}

async function code(promise: Promise<unknown>) {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error instanceof MessagingError ? error.code : String(error);
  }
}

let shop: Awaited<ReturnType<typeof publishedShop>>;
let other: Awaited<ReturnType<typeof publishedShop>>;

beforeAll(async () => {
  shop = await publishedShop();
  other = await publishedShop({ name: "Cachaça Outra Loja", producer_name: "Engenho Vizinho" });
}, 60_000);

afterAll(async () => {
  const db = supabaseAdmin();
  for (const storeId of createdStores) {
    const { data: images } = await db.from("product_images").select("storage_path").eq("store_id", storeId);
    const { data: frozen } = await db
      .from("presentation_images")
      .select("storage_path, presentations!inner(store_id)")
      .eq("presentations.store_id", storeId);
    const paths = [...new Set([...(images ?? []), ...(frozen ?? [])].map((r) => r.storage_path as string))];
    if (paths.length) await db.storage.from(bucket).remove(paths);
  }
  if (createdStores.length) await db.from("stores").delete().in("id", createdStores);
});

describe("T07 · consulta e interpretação", () => {
  it("grava o original antes da IA, vinculado à versão vista", async () => {
    const started = await inquire(shop.slug, shop.version);
    expect(started.created).toBe(true);
    const { data: message } = await supabaseAdmin()
      .from("messages")
      .select("body, body_lang, interpretation_status, translation, seq")
      .eq("id", started.messageId)
      .single();
    expect(message).toEqual({ body: SHANGHAI, body_lang: "zh-Hans", interpretation_status: "pending", translation: null, seq: 1 });
    const { data: conversation } = await supabaseAdmin()
      .from("conversations")
      .select("presentation_version, reply_lang, buyer_token_hash")
      .eq("id", started.conversationId)
      .single();
    expect(conversation).toMatchObject({ presentation_version: 1, reply_lang: "zh-Hans" });
    expect(conversation!.buyer_token_hash).not.toContain(started.token);
  });

  it("repetir o mesmo envio devolve a mesma conversa; segredo reutilizado com outra chave é recusado", async () => {
    const first = await inquire(shop.slug, shop.version);
    const again = await startConversation({
      slug: shop.slug,
      version: shop.version,
      token: first.token,
      clientKey: first.clientKey,
      message: SHANGHAI,
      name: null,
      company: null,
    });
    expect(again).toMatchObject({ conversationId: first.conversationId, messageId: first.messageId, created: false });
    expect(
      await code(
        startConversation({ slug: shop.slug, version: 1, token: first.token, clientKey: crypto.randomUUID(), message: "x", name: null, company: null }),
      ),
    ).toBe("token_conflict");
  });

  it("falha da IA preserva o original; repetir conclui com quantidade e entrega pendentes", async () => {
    const started = await inquire(shop.slug, shop.version);
    const failing = createTestMessagingAdapter(["provider_error"]);
    expect(await interpretMessage(shop.storeId, started.messageId, failing)).toBe("failed");

    let detail = await getConversationDetail(shop.storeId, started.conversationId);
    let message = detail!.messages[0]!;
    expect(message.author === "buyer" && message.interpretation).toMatchObject({ status: "failed", error: "provider_error", retryable: true });
    expect(message.author === "buyer" && message.original.text).toBe(SHANGHAI);

    expect(await retryInterpretation(shop.storeId, started.conversationId, started.messageId, createTestMessagingAdapter())).toBe("ready");
    detail = await getConversationDetail(shop.storeId, started.conversationId);
    message = detail!.messages[0]!;
    if (message.author !== "buyer") throw new Error("expected buyer");
    expect(message.translationPt).toContain("500");
    expect(message.interpretation.isTestAdapter).toBe(true);
    expect(message.analysis!.facts).toEqual(expect.arrayContaining([{ key: "volume_ml", label: "Volume", value: "700 mL por garrafa" }]));
    expect(message.analysis!.pending.map((p) => p.topic)).toEqual(expect.arrayContaining(["capacity", "freight"]));
    // Interpretação concluída não roda de novo.
    expect(await interpretMessage(shop.storeId, started.messageId, createTestMessagingAdapter())).toBe("skipped");
  });

  it("saída inválida nas duas tentativas termina em falha registrada, sem tradução", async () => {
    const started = await inquire(shop.slug, shop.version);
    const adapter = createTestMessagingAdapter(["invalid_output", "invalid_output"]);
    expect(await interpretMessage(shop.storeId, started.messageId, adapter)).toBe("failed");
    expect(adapter.calls).toBe(2);
    const { data: calls } = await supabaseAdmin()
      .from("ai_calls")
      .select("operation, status, attempt")
      .eq("conversation_id", started.conversationId)
      .order("attempt");
    expect(calls).toEqual([
      { operation: "interpret", status: "invalid_output", attempt: 1 },
      { operation: "interpret", status: "invalid_output", attempt: 2 },
    ]);
  });
});

describe("T08 · resposta revisada e envio único", () => {
  it("editar invalida a tradução; só a revisão traduzida pode ser enviada, uma vez", async () => {
    const started = await inquire(shop.slug, shop.version);
    await interpretMessage(shop.storeId, started.messageId, createTestMessagingAdapter());
    const adapter = createTestMessagingAdapter();

    // Sugestão usada como ponto de partida (só preenche o editor; nada é enviado).
    const detail = await getConversationDetail(shop.storeId, started.conversationId);
    const firstMessage = detail!.messages[0]!;
    if (firstMessage.author !== "buyer") throw new Error("expected buyer");
    const suggestion = firstMessage.analysis!.suggestedReply;
    expect(detail!.draft).toBeNull();
    expect((await getBuyerConversation(started.token))!.messages).toHaveLength(1);

    const first = await translateReplyDraft(shop.storeId, started.conversationId, null, `${suggestion} Temos 500 garrafas.`, adapter);
    expect(first.outcome).toBe("ready");
    expect(first.draft.translation).toMatchObject({ status: "ready", lang: "zh-Hans", revision: first.draft.revision });

    // Editar o português descarta a prévia anterior.
    const edited = await saveReplyDraft(shop.storeId, started.conversationId, first.draft.revision, "Temos 500 garrafas de 700 mL.");
    expect(edited.revision).toBe(first.draft.revision + 1);
    expect(edited.translation).toEqual({ status: "none" });
    expect(await code(sendReply(shop.storeId, started.conversationId, { draftId: edited.id, expectedRevision: first.draft.revision }))).toBe(
      "revision_conflict",
    );
    expect(await code(sendReply(shop.storeId, started.conversationId, { draftId: edited.id, expectedRevision: edited.revision }))).toBe(
      "translation_stale",
    );
    // O comprador ainda não vê nada do produtor.
    expect((await getBuyerConversation(started.token))!.messages.filter((m) => m.author === "producer")).toHaveLength(0);

    const second = await translateReplyDraft(shop.storeId, started.conversationId, edited.revision, "Temos 500 garrafas de 700 mL.", adapter);
    expect(second.outcome).toBe("ready");
    const request = { draftId: second.draft.id, expectedRevision: second.draft.revision };
    const [a, b] = await Promise.all([
      sendReply(shop.storeId, started.conversationId, request),
      sendReply(shop.storeId, started.conversationId, request),
    ]);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    expect(a.messageId).toBe(b.messageId);

    const buyer = await getBuyerConversation(started.token);
    const replies = buyer!.messages.filter((m) => m.author === "producer");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ lang: "zh-Hans", originalPt: "Temos 500 garrafas de 700 mL." });
    expect(replies[0]!.text).toContain("500");
    expect(buyer!.awaitingReply).toBe(false);
    // O comprador não recebe análise nem rascunho.
    expect(JSON.stringify(buyer)).not.toContain("suggested");
    expect(JSON.stringify(buyer)).not.toContain("analysis");

    const after = await getConversationDetail(shop.storeId, started.conversationId);
    expect(after!.draft).toBeNull();
    expect(after!.awaitingReply).toBe(false);
  });

  it("falha na tradução mantém o texto e permite repetir; retorno obsoleto é descartado", async () => {
    const started = await inquire(shop.slug, shop.version);
    const failed = await translateReplyDraft(
      shop.storeId,
      started.conversationId,
      null,
      "Podemos enviar 500 garrafas.",
      createTestMessagingAdapter(["timeout"]),
    );
    expect(failed.outcome).toBe("failed");
    expect(failed.draft).toMatchObject({ body: "Podemos enviar 500 garrafas.", translation: { status: "failed", error: "timeout" } });

    // Tradução lenta enquanto o produtor edita o texto: o resultado antigo não é aplicado.
    const slow = translateReplyDraft(
      shop.storeId,
      started.conversationId,
      failed.draft.revision,
      "Podemos enviar 500 garrafas.",
      createTestMessagingAdapter([], { delayMs: 3000 }),
    );
    // Espera a tradução ser reservada (chamada à IA em andamento) e então edita o texto.
    await expect
      .poll(
        async () =>
          (await supabaseAdmin().from("reply_drafts").select("translation_status").eq("id", failed.draft.id).single()).data
            ?.translation_status,
        { timeout: 10_000, interval: 100 },
      )
      .toBe("translating");
    const edited = await saveReplyDraft(shop.storeId, started.conversationId, failed.draft.revision, "Podemos enviar 600 garrafas.");
    const stale = await slow;
    expect(stale.outcome).toBe("stale");
    expect(stale.draft).toMatchObject({ revision: edited.revision, body: "Podemos enviar 600 garrafas.", translation: { status: "none" } });

    const retried = await translateReplyDraft(
      shop.storeId,
      started.conversationId,
      edited.revision,
      "Podemos enviar 600 garrafas.",
      createTestMessagingAdapter(),
    );
    expect(retried.outcome).toBe("ready");
    expect(retried.draft.translation.status === "ready" && retried.draft.translation.text).toContain("600");
  });

  it("comprador em inglês recebe a resposta em inglês", async () => {
    const started = await inquire(shop.slug, shop.version, "Hello, can you ship 500 bottles to Shanghai?");
    const adapter = createTestMessagingAdapter();
    await interpretMessage(shop.storeId, started.messageId, adapter);
    const translated = await translateReplyDraft(shop.storeId, started.conversationId, null, "Sim, temos 500 garrafas.", adapter);
    expect(translated.draft.translation).toMatchObject({ status: "ready", lang: "en" });
    await sendReply(shop.storeId, started.conversationId, { draftId: translated.draft.id, expectedRevision: translated.draft.revision });
    const buyer = await getBuyerConversation(started.token);
    expect(buyer!.messages.at(-1)).toMatchObject({ author: "producer", lang: "en" });
  });
});

describe("idioma da resposta", () => {
  it("pinyin identificado como chinês leva a resposta para o chinês e descarta prévia em inglês", async () => {
    const started = await inquire(shop.slug, shop.version, "nihao, wo zai beijing, wo yao cachaca");
    let detail = await getConversationDetail(shop.storeId, started.conversationId);
    expect(detail!.replyLang).toBe("en"); // escolha provisória pela escrita

    // Produtor traduz antes da interpretação terminar: prévia em inglês.
    const early = await translateReplyDraft(shop.storeId, started.conversationId, null, "Olá! Temos cachaça.", createTestMessagingAdapter());
    expect(early.draft.translation).toMatchObject({ status: "ready", lang: "en" });

    const pinyinAdapter: MessagingAdapter = {
      model: "gemini-sim",
      async interpretInquiry(): Promise<AdapterResult> {
        return {
          kind: "ok",
          raw: {
            language: "zh-Hans",
            translation_pt: "Olá, estou em Pequim e quero cachaça.",
            summary_pt: "Comprador em Pequim interessado em cachaça.",
            intents: ["other"],
            quantities: [],
            available_facts: [],
            missing: [],
            next_step_pt: "Perguntar quantidade e destino.",
            suggested_reply_pt: "Olá! Obrigado pelo interesse. Qual quantidade você procura?",
            cultural_note_pt: null,
          },
        };
      },
      async translateReply(): Promise<AdapterResult> {
        return { kind: "error", code: "provider_error", detail: "unused" };
      },
    };
    expect(await interpretMessage(shop.storeId, started.messageId, pinyinAdapter)).toBe("ready");
    detail = await getConversationDetail(shop.storeId, started.conversationId);
    expect(detail!.replyLang).toBe("zh-Hans");
    expect(detail!.draft!.translation).toEqual({ status: "none" });
    expect(await code(sendReply(shop.storeId, started.conversationId, { draftId: early.draft.id, expectedRevision: early.draft.revision }))).toBe(
      "translation_stale",
    );

    const again = await translateReplyDraft(shop.storeId, started.conversationId, detail!.draft!.revision, "Olá! Temos cachaça.", createTestMessagingAdapter());
    expect(again.draft.translation).toMatchObject({ status: "ready", lang: "zh-Hans" });
    await sendReply(shop.storeId, started.conversationId, { draftId: again.draft.id, expectedRevision: again.draft.revision });
    expect((await getBuyerConversation(started.token))!.messages.at(-1)).toMatchObject({ author: "producer", lang: "zh-Hans" });
  });

  it("hanzi misturado com pinyin já começa em chinês", async () => {
    const started = await inquire(shop.slug, shop.version, "nihao, wozaibeijing. woyao卡沙萨");
    expect((await getConversationDetail(shop.storeId, started.conversationId))!.replyLang).toBe("zh-Hans");
  });
});

describe("T09 · novidades e leitura", () => {
  it("badge conta conversas; só as entradas exibidas são lidas; aguardando resposta é distinto de nova", async () => {
    const store = await publishedShop({ name: "Cachaça Badge" });
    const a = await inquire(store.slug, store.version, "第一条消息");
    await addBuyerMessage(a.token, { clientKey: crypto.randomUUID(), message: "第二条消息" });
    await inquire(store.slug, store.version, "另一位买家");
    expect(await countUnreadConversations(store.storeId)).toBe(2);

    // A tela exibiu só a primeira entrada quando a segunda chegou.
    await markConversationRead(store.storeId, a.conversationId, 1);
    expect(await countUnreadConversations(store.storeId)).toBe(2);
    await markConversationRead(store.storeId, a.conversationId, 2);
    expect(await countUnreadConversations(store.storeId)).toBe(1);

    const list = await listConversations(store.storeId);
    const item = list.find((c) => c.id === a.conversationId)!;
    expect(item).toMatchObject({ hasUnread: false, awaitingReply: true, lastAuthor: "buyer" });

    // Repetir a mesma entrada (mesma chave) não duplica.
    const key = crypto.randomUUID();
    await addBuyerMessage(a.token, { clientKey: key, message: "第三条" });
    const repeat = await addBuyerMessage(a.token, { clientKey: key, message: "第三条" });
    expect(repeat.created).toBe(false);
    expect((await getBuyerConversation(a.token))!.messages).toHaveLength(3);
  });
});

describe("T10 · versão consultada", () => {
  it("conversa mantém a versão 1 após republicar; versão desatualizada pede nova revisão; vitrine retirada não inicia consulta", async () => {
    const store = await publishedShop({ name: "Cachaça Versões" });
    const started = await inquire(store.slug, 1);

    const current = await getProductForEdit(store.storeId, store.productId);
    await saveDraft(store.storeId, store.productId, { expectedRevision: current!.product.revision, ...draftOf({ name: "Cachaça Versões", price: "89,00" }) });
    const v2 = await publish(store.storeId, store.productId);
    expect(v2.version).toBe(2);

    const detail = await getConversationDetail(store.storeId, started.conversationId);
    expect(detail!.product).toMatchObject({ version: 1, currentVersion: 2, price: { brlCents: 7900, cnyFen: 9085 } });
    const buyer = await getBuyerConversation(started.token);
    expect(buyer!.product).toMatchObject({ version: 1, price: { cnyFen: 9085 }, available: true });

    // Comprador que abriu a versão 1 e enviou depois da republicação.
    expect(await code(inquire(store.slug, 1))).toBe("version_changed");
    expect((await inquire(store.slug, 2)).created).toBe(true);

    // Retirada (ponteiro público limpo): nova consulta recusada, conversa antiga segue.
    await supabaseAdmin().from("products").update({ published_presentation_id: null, status: "withdrawn" }).eq("id", store.productId);
    expect(await code(inquire(store.slug, 2))).toBe("product_unavailable");
    const back = await getBuyerConversation(started.token);
    expect(back!.product).toMatchObject({ version: 1, available: false });
    expect((await addBuyerMessage(started.token, { clientKey: crypto.randomUUID(), message: "还在吗？" })).created).toBe(true);
  });
});

describe("T01 · isolamento", () => {
  it("outra loja não lê nem altera a conversa; cada link privado abre só a própria conversa", async () => {
    const mine = await inquire(shop.slug, shop.version, "买家甲");
    const theirs = await inquire(other.slug, other.version, "买家乙");

    expect(await getConversationDetail(other.storeId, mine.conversationId)).toBeNull();
    expect((await listConversations(other.storeId)).map((c) => c.id)).not.toContain(mine.conversationId);
    expect(await code(markConversationRead(other.storeId, mine.conversationId, 1))).toBe("conversation_not_found");
    expect(await code(saveReplyDraft(other.storeId, mine.conversationId, null, "Invasão"))).toBe("conversation_not_found");
    expect(await code(translateReplyDraft(other.storeId, mine.conversationId, null, "Invasão", createTestMessagingAdapter()))).toBe(
      "conversation_not_found",
    );
    expect(await code(retryInterpretation(other.storeId, mine.conversationId, mine.messageId, createTestMessagingAdapter()))).toBe(
      "message_not_found",
    );

    const draft = await translateReplyDraft(shop.storeId, mine.conversationId, null, "Olá!", createTestMessagingAdapter());
    expect(await code(sendReply(other.storeId, mine.conversationId, { draftId: draft.draft.id, expectedRevision: draft.draft.revision }))).toBe(
      "conversation_not_found",
    );

    const viewA = await getBuyerConversation(mine.token);
    const viewB = await getBuyerConversation(theirs.token);
    expect(viewA!.messages.map((m) => m.text)).toEqual(["买家甲"]);
    expect(viewB!.messages.map((m) => m.text)).toEqual(["买家乙"]);
    expect(await getBuyerConversation(generateSessionToken())).toBeNull();
  });
});

describe("contrato real simulado", () => {
  it("uma resposta no formato do Gemini com número trocado é recusada e repetida", async () => {
    const started = await inquire(shop.slug, shop.version);
    let calls = 0;
    const gemini: MessagingAdapter = {
      model: "gemini-sim",
      async interpretInquiry(): Promise<AdapterResult> {
        calls += 1;
        return {
          kind: "ok",
          raw: {
            language: "zh-Hans",
            translation_pt: calls === 1 ? "Vocês fornecem 5000 garrafas em Xangai?" : "Vocês conseguem fornecer 500 garrafas? Podem entregar em Xangai?",
            summary_pt: "Pergunta sobre 500 garrafas com entrega em Xangai.",
            intents: ["quantity", "delivery"],
            quantities: [{ value: 500, unit_pt: "garrafas", source_text: "500瓶" }],
            available_facts: ["volume_ml"],
            missing: [{ topic: "freight", note_pt: "Cotar o frete marítimo até Xangai." }],
            next_step_pt: "Confirmar estoque e frete.",
            suggested_reply_pt: "Obrigado! Nossas garrafas têm 700 mL; vou confirmar estoque e frete.",
            cultural_note_pt: null,
          },
        };
      },
      async translateReply(): Promise<AdapterResult> {
        return { kind: "error", code: "provider_error", detail: "unused" };
      },
    };
    expect(await interpretMessage(shop.storeId, started.messageId, gemini)).toBe("ready");
    expect(calls).toBe(2);
    const detail = await getConversationDetail(shop.storeId, started.conversationId);
    const message = detail!.messages[0]!;
    if (message.author !== "buyer") throw new Error("expected buyer");
    expect(message.translationPt).toBe("Vocês conseguem fornecer 500 garrafas? Podem entregar em Xangai?");
    expect(message.analysis!.pending[0]).toMatchObject({ topic: "freight", note: "Cotar o frete marítimo até Xangai." });
    expect(message.analysis!.pending.map((p) => p.topic)).toContain("capacity");
  });
});
