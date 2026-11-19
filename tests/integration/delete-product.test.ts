/**
 * Exclusão definitiva de produto contra o Supabase de .env.local, com o adaptador
 * de IA de teste. Loja com dois produtos publicados, ambos com conversas e mensagens:
 * conta tudo antes, simula o cancelamento (nada muda), exclui um e confere que o
 * outro continua intacto; isolamento entre lojas, concorrência e limpeza do Storage.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createTestAdapter } from "@/modules/ai/test-adapter";
import {
  addBuyerMessage,
  countUnreadConversations,
  getBuyerConversation,
  listConversations,
  startConversation,
} from "@/modules/messaging/service";
import { EMPTY_FORM, formToDraft } from "@/modules/products/form";
import { generateAdaptation, getLabState, getPublicProduct, publishProduct } from "@/modules/products/publication";
import {
  ProductError,
  addImage,
  countPendingCleanup,
  deleteProduct,
  getDeletionImpact,
  listProducts,
  runStorageCleanup,
  saveDraft,
} from "@/modules/products/repository";
import { getCatalogRevision, getPublicCatalog } from "@/modules/stores/catalog";
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

const BASE_FORM = {
  ...EMPTY_FORM,
  short_description: "Cachaça de alambique envelhecida em amburana.",
  volume_ml: "700",
  abv_percent: "40",
  producer_name: "Engenho Exclusão",
  city: "Salinas",
  state: "MG",
  price: "79,00",
};

async function newProduct(storeId: string, name: string) {
  const form = formToDraft({ ...BASE_FORM, name });
  if (!form.ok) throw new Error(JSON.stringify(form.errors));
  const saved = await saveDraft(storeId, null, { expectedRevision: null, product: form.product, store: form.store });
  await addImage(storeId, saved.id, { bytes: JPEG, contentType: "image/jpeg", width: 1, height: 1 });
  await generateAdaptation(storeId, saved.id, (await getLabState(storeId, saved.id))!.product.revision, createTestAdapter());
  const lab = await getLabState(storeId, saved.id);
  const published = await publishProduct(storeId, saved.id, {
    adaptationId: lab!.usable!.id,
    choice: "semantica",
    expectedRevision: lab!.product.revision,
    expectedMediaRevision: lab!.product.mediaRevision,
  });
  return { id: saved.id, slug: published.slug, version: published.version };
}

async function inquire(slug: string, version: number, followUps: number) {
  const token = generateSessionToken();
  const started = await startConversation({
    slug,
    version,
    token,
    clientKey: crypto.randomUUID(),
    message: "您好！请问你们能供应500瓶吗？",
    name: null,
    company: null,
  });
  for (let i = 0; i < followUps; i++) {
    await addBuyerMessage(token, { clientKey: crypto.randomUUID(), message: `补充问题 ${i + 1}：可以送到上海吗？` });
  }
  return { token, conversationId: started.conversationId };
}

/** Linhas que o banco guarda sobre um produto (para comparar antes e depois). */
async function rowsOf(productId: string) {
  const db = supabaseAdmin();
  const count = async (table: string, column: string, value: string[]) => {
    const { count: n, error } = await db.from(table).select("*", { count: "exact", head: true }).in(column, value);
    if (error) throw new Error(`${table}: ${error.code}`);
    return n ?? 0;
  };
  const { data: conversations } = await db.from("conversations").select("id").eq("product_id", productId);
  const ids = (conversations ?? []).map((c) => c.id as string);
  return {
    products: await count("products", "id", [productId]),
    versions: await count("presentations", "product_id", [productId]),
    adaptations: await count("adaptations", "product_id", [productId]),
    images: await count("product_images", "product_id", [productId]),
    conversations: ids.length,
    messages: ids.length ? await count("messages", "conversation_id", ids) : 0,
  };
}

async function storageHas(storeId: string, productId: string) {
  const { data } = await supabaseAdmin().storage.from(bucket).list(`stores/${storeId}/products/${productId}`);
  return (data ?? []).length;
}

let storeId: string;
let otherStoreId: string;
let alfa: Awaited<ReturnType<typeof newProduct>>;
let beta: Awaited<ReturnType<typeof newProduct>>;
let gama: Awaited<ReturnType<typeof newProduct>>;
let alfaChat: Awaited<ReturnType<typeof inquire>>;
let alfaChat2: Awaited<ReturnType<typeof inquire>>;
let betaChat: Awaited<ReturnType<typeof inquire>>;

beforeAll(async () => {
  storeId = await ensureStoreForToken(generateSessionToken());
  otherStoreId = await ensureStoreForToken(generateSessionToken());
  createdStores.push(storeId, otherStoreId);
  alfa = await newProduct(storeId, "Cachaça Alfa Demo");
  beta = await newProduct(storeId, "Cachaça Beta Demo");
  gama = await newProduct(storeId, "Cachaça Gama Demo");
  alfaChat = await inquire(alfa.slug, alfa.version, 1); // 2 mensagens
  alfaChat2 = await inquire(alfa.slug, alfa.version, 0); // 1 mensagem
  betaChat = await inquire(beta.slug, beta.version, 2); // 3 mensagens
}, 120_000);

afterAll(async () => {
  const db = supabaseAdmin();
  for (const id of createdStores) {
    const { data: files } = await db.storage.from(bucket).list(`stores/${id}/products`);
    for (const folder of files ?? []) {
      const { data: inner } = await db.storage.from(bucket).list(`stores/${id}/products/${folder.name}`);
      const paths = (inner ?? []).map((f) => `stores/${id}/products/${folder.name}/${f.name}`);
      if (paths.length) await db.storage.from(bucket).remove(paths);
    }
    await db.from("storage_cleanup").delete().eq("store_id", id);
  }
  if (createdStores.length) await db.from("stores").delete().in("id", createdStores);
});

describe("exclusão definitiva de produto", () => {
  it("mostra o nome e quantas conversas serão apagadas, sem alterar nada", async () => {
    expect(await getDeletionImpact(storeId, alfa.id)).toEqual({ name: "Cachaça Alfa Demo", conversationCount: 2, messageCount: 3 });
    expect(await getDeletionImpact(storeId, beta.id)).toEqual({ name: "Cachaça Beta Demo", conversationCount: 1, messageCount: 3 });
  });

  it("recusa produto de outra loja, sem apagar nada", async () => {
    expect(await getDeletionImpact(otherStoreId, alfa.id)).toBeNull();
    await expect(deleteProduct(otherStoreId, alfa.id, null)).rejects.toMatchObject({ code: "not_found" });
    expect(await rowsOf(alfa.id)).toMatchObject({ products: 1, conversations: 2, messages: 3 });
  });

  it("recusa a exclusão se chegou conversa depois da confirmação", async () => {
    const error = await deleteProduct(storeId, alfa.id, 1).catch((e) => e);
    expect(error).toBeInstanceOf(ProductError);
    expect((error as ProductError).code).toBe("conversations_changed");
    expect(await rowsOf(alfa.id)).toMatchObject({ products: 1, conversations: 2, messages: 3 });
  });

  it("exclui um produto e preserva o outro, com suas conversas intactas", async () => {
    const before = { alfa: await rowsOf(alfa.id), beta: await rowsOf(beta.id), revision: await getCatalogRevision(storeId) };
    expect(before.alfa).toEqual({ products: 1, versions: 1, adaptations: 1, images: 1, conversations: 2, messages: 3 });
    expect(before.beta).toEqual({ products: 1, versions: 1, adaptations: 1, images: 1, conversations: 1, messages: 3 });
    expect((await listProducts(storeId)).map((p) => p.name)).toEqual(["Cachaça Alfa Demo", "Cachaça Beta Demo", "Cachaça Gama Demo"]);
    expect(await countUnreadConversations(storeId)).toBe(3);
    expect(await storageHas(storeId, alfa.id)).toBeGreaterThan(0);

    const result = await deleteProduct(storeId, alfa.id, 2);
    expect(result).toEqual({ conversationCount: 2, messageCount: 3, pendingCleanup: 0 });

    // Apagado: produto, versões, adaptações, fotos, conversas e mensagens.
    expect(await rowsOf(alfa.id)).toEqual({ products: 0, versions: 0, adaptations: 0, images: 0, conversations: 0, messages: 0 });
    expect(await getBuyerConversation(alfaChat.token)).toBeNull();
    expect(await getBuyerConversation(alfaChat2.token)).toBeNull();
    expect(await storageHas(storeId, alfa.id)).toBe(0);
    expect(await countPendingCleanup(storeId)).toBe(0);

    // Preservado: o outro produto e sua conversa, byte a byte nas contagens.
    expect(await rowsOf(beta.id)).toEqual(before.beta);
    expect(await storageHas(storeId, beta.id)).toBeGreaterThan(0);
    const buyer = await getBuyerConversation(betaChat.token);
    expect(buyer?.messages).toHaveLength(3);
    const producerList = await listConversations(storeId);
    expect(producerList.map((c) => c.id)).toEqual([betaChat.conversationId]);
    expect(await countUnreadConversations(storeId)).toBe(1);

    // Lista, ordem salva sem lacunas e revisão do catálogo.
    const products = await listProducts(storeId);
    expect(products.map((p) => [p.name, p.position])).toEqual([["Cachaça Beta Demo", 0], ["Cachaça Gama Demo", 1]]);
    expect(await getCatalogRevision(storeId)).toBe(before.revision + 1);
  });

  it("o QR antigo não abre mais o produto; a loja pública mostra o próximo na ordem", async () => {
    expect(await getPublicProduct(alfa.slug)).toBeNull();
    const { data: store } = await supabaseAdmin().from("stores").select("public_slug").eq("id", storeId).single();
    const catalog = await getPublicCatalog(store!.public_slug!);
    expect(catalog?.items.map((i) => i.slug)).toEqual([beta.slug, gama.slug]);
  });

  it("repetir a exclusão não duplica efeitos", async () => {
    await expect(deleteProduct(storeId, alfa.id, null)).rejects.toMatchObject({ code: "not_found" });
    expect(await rowsOf(beta.id)).toMatchObject({ products: 1, conversations: 1, messages: 3 });
  });

  it("mantém a fila de arquivos quando o Storage falha e repete a limpeza", async () => {
    // Simula falha anterior: o produto some e os arquivos ficam na fila.
    const { data: images } = await supabaseAdmin().from("product_images").select("storage_path").eq("product_id", gama.id);
    const paths = (images ?? []).map((i) => i.storage_path as string);
    expect(paths.length).toBeGreaterThan(0);
    // A exclusão em si funciona; depois recolocamos a fila como se o Storage tivesse falhado.
    await deleteProduct(storeId, gama.id, 0);
    await supabaseAdmin().storage.from(bucket).upload(paths[0]!, JPEG, { contentType: "image/jpeg", upsert: true });
    await supabaseAdmin().from("storage_cleanup").insert(paths.map((p) => ({ storage_path: p, store_id: storeId, product_id: gama.id, attempts: 1, last_error: "storage_error" })));
    expect(await countPendingCleanup(storeId)).toBe(paths.length);
    expect(await storageHas(storeId, gama.id)).toBeGreaterThan(0);

    expect(await runStorageCleanup(storeId)).toBe(0);
    expect(await countPendingCleanup(storeId)).toBe(0);
    expect(await storageHas(storeId, gama.id)).toBe(0);
  });
});
