/**
 * T06 · Loja com vários produtos, contra o Supabase de .env.local e o
 * adaptador de IA de teste: só publicados no catálogo, na ordem persistida,
 * destaque = primeiro publicado, endereços estáveis ao reordenar e republicar,
 * apresentação da loja aprovada só com confirmação, isolamento entre lojas e
 * consulta aberta pelo catálogo vinculada ao produto certo.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createTestAdapter } from "@/modules/ai/test-adapter";
import { getConversationDetail, listConversations, startConversation } from "@/modules/messaging/service";
import { EMPTY_FORM, formToDraft } from "@/modules/products/form";
import { generateAdaptation, getLabState, getPublicProduct, publishProduct } from "@/modules/products/publication";
import { addImage, getProductForEdit, listProducts, saveDraft } from "@/modules/products/repository";
import {
  StoreError,
  getCatalogRevision,
  getPublicCatalog,
  getStoreOverview,
  reorderProducts,
} from "@/modules/stores/catalog";
import { saveStoreIntro } from "@/modules/stores/intro";
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
  wood: "amburana",
  producer_name: "Engenho Catálogo",
  city: "Salinas",
  state: "MG",
  region: "Norte de Minas",
};

function draftOf(overrides: Partial<typeof EMPTY_FORM>) {
  const result = formToDraft({ ...BASE_FORM, ...overrides });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return { product: result.product, store: result.store };
}

async function newStore() {
  const storeId = await ensureStoreForToken(generateSessionToken());
  createdStores.push(storeId);
  return storeId;
}

async function product(storeId: string, overrides: Partial<typeof EMPTY_FORM>) {
  const saved = await saveDraft(storeId, null, { expectedRevision: null, ...draftOf(overrides) });
  await addImage(storeId, saved.id, { bytes: JPEG, contentType: "image/jpeg", width: 1, height: 1 });
  return saved.id;
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

async function code(promise: Promise<unknown>) {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error instanceof StoreError ? error.code : String(error);
  }
}

let storeA: string;
let first: string;
let second: string;
let draft: string;
let firstSlug: string;
let secondSlug: string;
let storeSlug: string;

beforeAll(async () => {
  storeA = await newStore();
  first = await product(storeA, { name: "Cachaça Primeira", price: "79,00" });
  second = await product(storeA, { name: "Cachaça Segunda" });
  draft = await product(storeA, { name: "Cachaça Rascunho" });
});

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

describe("abertura da loja", () => {
  it("sem produto publicado não há catálogo nem endereço", async () => {
    const overview = await getStoreOverview(storeA);
    expect(overview).toMatchObject({ public: null });
  });

  it("a primeira publicação abre a loja; a apresentação só entra quando aprovada", async () => {
    const published = await publish(storeA, first);
    firstSlug = published.slug;

    const overview = await getStoreOverview(storeA);
    expect(overview?.public).not.toBeNull();
    storeSlug = overview!.public!.slug;
    expect(storeSlug).toMatch(/^[a-z0-9]{10}$/);
    expect(overview!.public!.url.endsWith(`/l/${storeSlug}`)).toBe(true);
    expect(overview!.public!.profile).toEqual({ name: "Engenho Catálogo", city: "Salinas", state: "MG", region: "Norte de Minas" });
    expect(overview!.public!.intro).toBeNull();
    expect(overview!.public!.catalog.intro).toBeNull();

    // A apresentação é escrita pelo produtor, traduzida e aprovada à parte.
    const again = await publish(storeA, second);
    secondSlug = again.slug;
    await saveStoreIntro(storeA, "Engenho familiar de Salinas, feito em alambique de cobre.", "萨利纳斯的家族酿酒厂，使用铜制蒸馏器酿造。");
    const after = await getStoreOverview(storeA);
    expect(after!.public!.slug).toBe(storeSlug);
    expect(after!.public!.intro?.zh).toMatch(/[一-鿿]/);
    expect(after!.public!.intro?.pt).toBeTruthy();
  });
});

describe("catálogo público", () => {
  it("lista só os publicados, na ordem da loja, com a versão aprovada de cada um", async () => {
    const catalog = await getPublicCatalog(storeSlug);
    expect(catalog?.producer).toBe("Engenho Catálogo");
    expect(catalog?.origin).toBe("Salinas, MG · Norte de Minas");
    expect(catalog?.items.map((i) => i.slug)).toEqual([firstSlug, secondSlug]);
    expect(catalog?.items.map((i) => i.originalName)).toEqual(["Cachaça Primeira", "Cachaça Segunda"]);
    expect(catalog?.items[0]).toMatchObject({ title: "蓝山醇", titleLang: "zh-Hans", specs: "700 mL · 40% vol", price: { cnyFen: 9085, brlCents: 7900 } });
    expect(catalog?.items[1]?.price).toBeNull();
    expect(catalog?.items.every((i) => i.image?.url.startsWith("http"))).toBe(true);
    // O rascunho não vaza, nem pelo nome.
    expect(JSON.stringify(catalog)).not.toContain("Rascunho");
  });

  it("código inexistente ou malformado não abre loja", async () => {
    expect(await getPublicCatalog("zzzzzzzzzz")).toBeNull();
    expect(await getPublicCatalog("../admin")).toBeNull();
  });

  it("a vitrine individual leva de volta à loja", async () => {
    const product = await getPublicProduct(secondSlug);
    expect(product?.store).toEqual({ slug: storeSlug, producer: "Engenho Catálogo" });
  });
});

describe("ordem e destaque", () => {
  it("reordenar troca o destaque sem mudar links, versões nem revisões dos produtos", async () => {
    const before = await listProducts(storeA);
    expect(before.map((p) => p.id)).toEqual([first, second, draft]);
    const revision = await getCatalogRevision(storeA);

    const result = await reorderProducts(storeA, [draft, second, first], revision);
    expect(result.catalogRevision).toBe(revision + 1);

    // Rascunho no topo não vira destaque: o primeiro publicado é a Segunda.
    const catalog = await getPublicCatalog(storeSlug);
    expect(catalog?.items.map((i) => i.slug)).toEqual([secondSlug, firstSlug]);

    const after = await listProducts(storeA);
    expect(after.map((p) => p.id)).toEqual([draft, second, first]);
    for (const item of after) {
      const old = before.find((p) => p.id === item.id)!;
      expect(item).toMatchObject({ publicSlug: old.publicSlug, publishedVersion: old.publishedVersion, status: old.status });
    }
    expect((await getStoreOverview(storeA))!.public!.slug).toBe(storeSlug);
  });

  it("repetir a mesma ordem não grava de novo; revisão antiga com outra ordem é recusada", async () => {
    const revision = await getCatalogRevision(storeA);
    expect(await reorderProducts(storeA, [draft, second, first], revision - 1)).toEqual({ catalogRevision: revision });
    expect(await code(reorderProducts(storeA, [first, second, draft], revision - 1))).toBe("revision_conflict");
    expect(await getCatalogRevision(storeA)).toBe(revision);
  });

  it("lista incompleta, repetida ou com produto de outra loja é recusada", async () => {
    const revision = await getCatalogRevision(storeA);
    const storeB = await newStore();
    const foreign = await product(storeB, { name: "Cachaça Alheia" });
    expect(await code(reorderProducts(storeA, [second, first], revision))).toBe("order_mismatch");
    expect(await code(reorderProducts(storeA, [second, second, first], revision))).toBe("order_mismatch");
    expect(await code(reorderProducts(storeA, [draft, second, foreign], revision))).toBe("order_mismatch");
    // A loja B não reordena produtos da A.
    expect(await code(reorderProducts(storeB, [first, second, draft], await getCatalogRevision(storeB)))).toBe("order_mismatch");
    expect((await listProducts(storeA)).map((p) => p.id)).toEqual([draft, second, first]);
  });

  it("editar e republicar mantém os endereços da loja e do produto", async () => {
    const current = await getProductForEdit(storeA, second);
    await saveDraft(storeA, second, { expectedRevision: current!.product.revision, ...draftOf({ name: "Cachaça Segunda", price: "89,00" }) });
    const republished = await publish(storeA, second);
    expect(republished).toMatchObject({ slug: secondSlug, version: 2, created: true });

    const catalog = await getPublicCatalog(storeSlug);
    expect(catalog?.items.map((i) => i.slug)).toEqual([secondSlug, firstSlug]);
    expect(catalog?.items[0]?.price).toEqual({ cnyFen: 10235, brlCents: 8900 });
    expect((await getStoreOverview(storeA))!.public!.slug).toBe(storeSlug);
  });
});

describe("consulta a partir do catálogo", () => {
  it("abrir o segundo item e perguntar cria a conversa do produto certo", async () => {
    const catalog = await getPublicCatalog(storeSlug);
    const target = catalog!.items[1]!; // Cachaça Primeira, depois da reordenação
    const page = await getPublicProduct(target.slug);
    if (page?.state !== "published") throw new Error("vitrine indisponível");

    const started = await startConversation({
      slug: target.slug,
      version: page.version,
      token: generateSessionToken(),
      clientKey: crypto.randomUUID(),
      message: "你好，请问这款酒可以订500瓶吗？",
      name: null,
      company: null,
    });
    const detail = await getConversationDetail(storeA, started.conversationId);
    expect(detail).not.toBeNull();
    const { data: row } = await supabaseAdmin()
      .from("conversations")
      .select("product_id, presentation_version")
      .eq("id", started.conversationId)
      .single();
    expect(row).toEqual({ product_id: first, presentation_version: page.version });
    const listed = (await listConversations(storeA)).find((c) => c.id === started.conversationId);
    expect(listed?.productName).toBe("Cachaça Primeira");
  });
});
