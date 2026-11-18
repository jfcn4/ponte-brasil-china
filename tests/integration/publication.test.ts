/**
 * Integração da geração e publicação contra o Supabase de .env.local, com o
 * adaptador de IA de teste. Cobre T03 (só saída válida libera revisão), T04
 * (falha preserva rascunho, retorno obsoleto, dupla confirmação), T05 (preço
 * publicado só muda ao republicar) e parte de T01/T10 (isolamento e versões).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createTestAdapter } from "@/modules/ai/test-adapter";
import { EMPTY_FORM, formToDraft } from "@/modules/products/form";
import {
  PublicationError,
  generateAdaptation,
  getLabState,
  getPublicProduct,
  publishProduct,
} from "@/modules/products/publication";
import { ProductError, addImage, getProductForEdit, removeImage, saveDraft } from "@/modules/products/repository";
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
  name: "Cachaça Integração",
  short_description: "Cachaça de alambique envelhecida em amburana.",
  volume_ml: "700",
  abv_percent: "40",
  wood: "amburana",
  producer_name: "Engenho Teste",
  city: "Salinas",
  state: "MG",
  region: "Norte de Minas",
  price: "79,00",
};

function draft(overrides: Partial<typeof EMPTY_FORM> = {}) {
  const result = formToDraft({ ...BASE_FORM, ...overrides });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return { product: result.product, store: result.store };
}

async function newStore() {
  const storeId = await ensureStoreForToken(generateSessionToken());
  createdStores.push(storeId);
  return storeId;
}

/** Produto com nome, descrição e uma foto: pronto para gerar. */
async function readyProduct(storeId: string, overrides: Partial<typeof EMPTY_FORM> = {}) {
  const saved = await saveDraft(storeId, null, { expectedRevision: null, ...draft(overrides) });
  await addImage(storeId, saved.id, { bytes: JPEG, contentType: "image/jpeg", width: 1, height: 1 });
  return saved;
}

async function edit(storeId: string, productId: string, overrides: Partial<typeof EMPTY_FORM>) {
  const current = await getProductForEdit(storeId, productId);
  return saveDraft(storeId, productId, { expectedRevision: current!.product.revision, ...draft(overrides) });
}

async function labOf(storeId: string, productId: string) {
  const lab = await getLabState(storeId, productId);
  if (!lab) throw new Error("lab not found");
  return lab;
}

async function publishUsable(storeId: string, productId: string, choice: "fonetica" | "semantica" | "equilibrada" | "original") {
  const lab = await labOf(storeId, productId);
  if (!lab.usable) throw new Error("no usable adaptation");
  return publishProduct(storeId, productId, {
    adaptationId: lab.usable.id,
    choice,
    expectedRevision: lab.product.revision,
    expectedMediaRevision: lab.product.mediaRevision,
  });
}

let storeA: string;
let storeB: string;

beforeAll(async () => {
  storeA = await newStore();
  storeB = await newStore();
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

describe("geração (operação 1)", () => {
  it("gera três opções válidas a partir do rascunho salvo e grava a entrada", async () => {
    const product = await readyProduct(storeA);
    const result = await generateAdaptation(storeA, product.id, product.revision, createTestAdapter());
    expect(result).toMatchObject({ status: "ready", errorCode: null });

    const lab = await labOf(storeA, product.id);
    expect(lab.usable?.output.options).toHaveLength(3);
    expect(lab.usable?.isTestAdapter).toBe(true);
    expect(lab.latest?.isCurrent).toBe(true);
    expect(lab.published).toBeNull();
    expect(lab.product.status).toBe("draft");

    const { data: row } = await supabaseAdmin().from("adaptations").select("input, source_revision").eq("id", result.adaptationId).single();
    expect(row!.source_revision).toBe(product.revision);
    expect(JSON.stringify(row!.input)).not.toContain("7900"); // preço não vai para a IA

    const { data: calls } = await supabaseAdmin().from("ai_calls").select("status, model, attempt").eq("adaptation_id", result.adaptationId);
    expect(calls).toEqual([{ status: "ok", model: "test-adapter", attempt: 1 }]);
  });

  it("falha do provedor preserva o rascunho e permite tentar novamente", async () => {
    const product = await readyProduct(storeA, { name: "Falha e Repetição" });
    const adapter = createTestAdapter(["provider_error"]);

    const failed = await generateAdaptation(storeA, product.id, product.revision, adapter);
    expect(failed).toMatchObject({ status: "failed", errorCode: "provider_error" });
    let lab = await labOf(storeA, product.id);
    expect(lab.usable).toBeNull();
    expect(lab.latest).toMatchObject({ status: "failed", errorCode: "provider_error" });
    expect(lab.draft.name).toBe("Falha e Repetição");
    expect(lab.product.revision).toBe(product.revision);

    const retried = await generateAdaptation(storeA, product.id, product.revision, adapter);
    expect(retried.status).toBe("ready");
    lab = await labOf(storeA, product.id);
    expect(lab.usable?.id).toBe(retried.adaptationId);
  });

  it("saída inválida é repetida uma vez; duas inválidas falham sem liberar revisão", async () => {
    const product = await readyProduct(storeA, { name: "Saída Inválida" });

    const recovered = await generateAdaptation(storeA, product.id, product.revision, createTestAdapter(["repeated_strategy"]));
    expect(recovered.status).toBe("ready");

    const adapter = createTestAdapter(["missing_pinyin", "repeated_strategy"]);
    const failed = await generateAdaptation(storeA, product.id, product.revision, adapter);
    expect(failed).toMatchObject({ status: "failed", errorCode: "invalid_output" });
    expect(adapter.calls).toBe(2);
    const { data: calls } = await supabaseAdmin()
      .from("ai_calls")
      .select("status, attempt")
      .eq("adaptation_id", failed.adaptationId)
      .order("attempt");
    expect(calls).toEqual([
      { status: "invalid_output", attempt: 1 },
      { status: "invalid_output", attempt: 2 },
    ]);
  });

  it("recusa gerar sem o mínimo (foto) e com revisão desatualizada", async () => {
    const noPhoto = await saveDraft(storeA, null, { expectedRevision: null, ...draft({ name: "Sem Foto" }) });
    await expect(generateAdaptation(storeA, noPhoto.id, noPhoto.revision, createTestAdapter())).rejects.toSatisfy(
      (e: unknown) => e instanceof PublicationError && e.code === "missing_requirements",
    );

    const product = await readyProduct(storeA, { name: "Revisão Antiga" });
    await edit(storeA, product.id, { name: "Revisão Nova" });
    await expect(generateAdaptation(storeA, product.id, product.revision, createTestAdapter())).rejects.toSatisfy(
      (e: unknown) => e instanceof ProductError && e.code === "revision_conflict",
    );
  });

  it("uma geração por vez para o mesmo produto", async () => {
    const product = await readyProduct(storeA, { name: "Cliques Repetidos" });
    const slow = createTestAdapter([], { delayMs: 1500 });
    const results = await Promise.allSettled([
      generateAdaptation(storeA, product.id, product.revision, slow),
      generateAdaptation(storeA, product.id, product.revision, slow),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(PublicationError);
    expect((rejected[0]!.reason as PublicationError).code).toBe("generation_in_progress");
  });

  it("outra loja não gera nem lê o laboratório deste produto", async () => {
    const product = await readyProduct(storeA, { name: "Privado da Loja A" });
    await expect(generateAdaptation(storeB, product.id, product.revision, createTestAdapter())).rejects.toSatisfy(
      (e: unknown) => e instanceof ProductError && e.code === "not_found",
    );
    expect(await getLabState(storeB, product.id)).toBeNull();
  });
});

describe("publicação e vitrine pública", () => {
  it("publica o nome escolhido com ¥90.85; edição privada só aparece após republicar no mesmo link", async () => {
    const product = await readyProduct(storeA, { name: "Cachaça do Aceite" });
    await generateAdaptation(storeA, product.id, product.revision, createTestAdapter());

    // Rascunho ainda não tem link público.
    let lab = await labOf(storeA, product.id);
    expect(lab.published).toBeNull();

    const first = await publishUsable(storeA, product.id, "semantica");
    expect(first).toMatchObject({ version: 1, created: true });
    expect(first.slug).toMatch(/^[a-z0-9]{10}$/);

    let pub = await getPublicProduct(first.slug);
    expect(pub?.state).toBe("published");
    if (pub?.state !== "published") throw new Error("not published");
    expect(pub.view.title).toBe("蓝山醇");
    expect(pub.view.pinyin).toBe("Lán Shān Chún");
    expect(pub.view.price).toEqual({ cnyFen: 9085, brlCents: 7900 });
    expect(pub.view.images).toHaveLength(1);
    expect(pub.view.images[0]!.url).toContain("/storage/v1/object/sign/");
    expect(pub.snapshot.price?.rate).toBe("1.15");

    lab = await labOf(storeA, product.id);
    expect(lab.product.status).toBe("published");
    expect(lab.published?.url).toMatch(new RegExp(`/p/${first.slug}$`));
    expect(lab.published?.qrSvg).toContain("<svg");
    expect(lab.published?.qrPngDataUrl).toMatch(/^data:image\/png;base64,/);

    // Edição privada: preço para R$ 89,00. A vitrine continua em ¥90.85.
    await edit(storeA, product.id, { name: "Cachaça do Aceite", price: "89,00" });
    pub = await getPublicProduct(first.slug);
    if (pub?.state !== "published") throw new Error("not published");
    expect(pub.view.price?.cnyFen).toBe(9085);
    lab = await labOf(storeA, product.id);
    expect(lab.product.status).toBe("pending");
    expect(lab.published?.pending).toBe(true);
    // Preço não entra na IA: a adaptação continua válida, sem nova geração.
    expect(lab.usable).not.toBeNull();

    const second = await publishUsable(storeA, product.id, "semantica");
    expect(second).toMatchObject({ version: 2, slug: first.slug, created: true });
    pub = await getPublicProduct(first.slug);
    if (pub?.state !== "published") throw new Error("not published");
    expect(pub.view.price?.cnyFen).toBe(10235);
    expect(pub.version).toBe(2);
    expect((await labOf(storeA, product.id)).product.status).toBe("published");

    // A versão 1 permanece no histórico com o preço da época.
    const { data: versions } = await supabaseAdmin()
      .from("presentations")
      .select("version, snapshot")
      .eq("product_id", product.id)
      .order("version");
    expect(versions!.map((v) => [v.version, (v.snapshot as { price: { cny_fen: number } }).price.cny_fen])).toEqual([
      [1, 9085],
      [2, 10235],
    ]);
  });

  it("confirmar duas vezes mantém uma só versão pública", async () => {
    const product = await readyProduct(storeA, { name: "Dupla Confirmação" });
    await generateAdaptation(storeA, product.id, product.revision, createTestAdapter());
    const lab = await labOf(storeA, product.id);
    const request = {
      adaptationId: lab.usable!.id,
      choice: "equilibrada" as const,
      expectedRevision: lab.product.revision,
      expectedMediaRevision: lab.product.mediaRevision,
    };
    const [a, b] = await Promise.all([publishProduct(storeA, product.id, request), publishProduct(storeA, product.id, request)]);
    expect(a.version).toBe(1);
    expect(b.version).toBe(1);
    expect([a.created, b.created].sort()).toEqual([false, true]);
    const again = await publishProduct(storeA, product.id, request);
    expect(again).toMatchObject({ version: 1, created: false });
    const { count } = await supabaseAdmin()
      .from("presentations")
      .select("id", { count: "exact", head: true })
      .eq("product_id", product.id);
    expect(count).toBe(1);
  });

  it("retorno obsoleto: nome alterado depois da geração exige nova geração", async () => {
    const product = await readyProduct(storeA, { name: "Nome Antes" });
    const generated = await generateAdaptation(storeA, product.id, product.revision, createTestAdapter());
    await edit(storeA, product.id, { name: "Nome Depois" });

    const lab = await labOf(storeA, product.id);
    expect(lab.usable).toBeNull();
    expect(lab.hasStaleReady).toBe(true);
    expect(lab.latest?.isCurrent).toBe(false);
    await expect(
      publishProduct(storeA, product.id, {
        adaptationId: generated.adaptationId,
        choice: "fonetica",
        expectedRevision: lab.product.revision,
        expectedMediaRevision: lab.product.mediaRevision,
      }),
    ).rejects.toSatisfy((e: unknown) => e instanceof PublicationError && e.code === "adaptation_stale");
  });

  it("prévia desatualizada (revisão ou fotos) não publica", async () => {
    const product = await readyProduct(storeA, { name: "Prévia Antiga" });
    await generateAdaptation(storeA, product.id, product.revision, createTestAdapter());
    const lab = await labOf(storeA, product.id);
    await addImage(storeA, product.id, { bytes: JPEG, contentType: "image/jpeg", width: 1, height: 1 });
    await expect(
      publishProduct(storeA, product.id, {
        adaptationId: lab.usable!.id,
        choice: "fonetica",
        expectedRevision: lab.product.revision,
        expectedMediaRevision: lab.product.mediaRevision,
      }),
    ).rejects.toSatisfy((e: unknown) => e instanceof ProductError && e.code === "revision_conflict");
  });

  it("produtor não identificado não publica", async () => {
    const store = await newStore();
    const product = await readyProduct(store, { producer_name: "" });
    await generateAdaptation(store, product.id, product.revision, createTestAdapter());
    await expect(publishUsable(store, product.id, "equilibrada")).rejects.toSatisfy(
      (e: unknown) => e instanceof PublicationError && e.code === "missing_producer",
    );
  });

  it("foto removida do rascunho continua na vitrine publicada até republicar", async () => {
    const product = await readyProduct(storeA, { name: "Foto Congelada" });
    await generateAdaptation(storeA, product.id, product.revision, createTestAdapter());
    const published = await publishUsable(storeA, product.id, "original");

    const lab = await labOf(storeA, product.id);
    await removeImage(storeA, product.id, lab.images[0]!.id);

    const pub = await getPublicProduct(published.slug);
    if (pub?.state !== "published") throw new Error("not published");
    expect(pub.view.title).toBe("Foto Congelada");
    expect(pub.view.titleLang).toBe("pt-BR");
    expect(pub.view.images).toHaveLength(1);
    const image = await fetch(pub.view.images[0]!.url);
    expect(image.status).toBe(200);
    expect((await labOf(storeA, product.id)).product.status).toBe("pending");
  });

  it("outra loja não publica; link desconhecido ou malformado não abre nada", async () => {
    const product = await readyProduct(storeA, { name: "Só Loja A Publica" });
    await generateAdaptation(storeA, product.id, product.revision, createTestAdapter());
    const lab = await labOf(storeA, product.id);
    await expect(
      publishProduct(storeB, product.id, {
        adaptationId: lab.usable!.id,
        choice: "fonetica",
        expectedRevision: lab.product.revision,
        expectedMediaRevision: lab.product.mediaRevision,
      }),
    ).rejects.toSatisfy((e: unknown) => e instanceof ProductError && e.code === "not_found");
    expect(await getPublicProduct("zzzzzzzzzz")).toBeNull();
    expect(await getPublicProduct("../../etc")).toBeNull();
  });
});
