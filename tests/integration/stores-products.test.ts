/**
 * Integração contra o Supabase configurado em .env.local. Cada execução cria
 * lojas próprias (sessões aleatórias) e as remove ao final, com as fotos.
 * Cobre parte de T01 (isolamento entre produtores), T02 (rascunho e limite de
 * três fotos) e T04 (comparação de revisão).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { EMPTY_FORM, formToDraft } from "@/modules/products/form";
import {
  ProductError,
  addImage,
  getProductForEdit,
  getStoreOrigin,
  listImages,
  listProducts,
  removeImage,
  saveDraft,
  setPrimaryImage,
} from "@/modules/products/repository";
import { ensureStoreForToken, findStoreIdByToken } from "@/modules/stores/session";
import { generateSessionToken } from "@/modules/stores/token";

// JPEG 1×1 válido.
const JPEG = Uint8Array.from(
  Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
    "base64",
  ),
);

const createdStores: string[] = [];
const bucket = process.env.SUPABASE_STORAGE_BUCKET!;

async function newStore() {
  const token = generateSessionToken();
  const storeId = await ensureStoreForToken(token);
  createdStores.push(storeId);
  return { token, storeId };
}

function draft(overrides: Partial<typeof EMPTY_FORM> = {}) {
  const result = formToDraft({ ...EMPTY_FORM, ...overrides });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return { product: result.product, store: result.store };
}

async function expectProductError(promise: Promise<unknown>, code: ProductError["code"]) {
  await expect(promise).rejects.toSatisfy((e: unknown) => e instanceof ProductError && e.code === code);
}

let a: { token: string; storeId: string };
let b: { token: string; storeId: string };

beforeAll(async () => {
  a = await newStore();
  b = await newStore();
});

afterAll(async () => {
  const db = supabaseAdmin();
  for (const storeId of createdStores) {
    const { data } = await db.from("product_images").select("storage_path").eq("store_id", storeId);
    const paths = (data ?? []).map((r) => r.storage_path);
    if (paths.length) await db.storage.from(bucket).remove(paths);
  }
  if (createdStores.length) await db.from("stores").delete().in("id", createdStores);
});

describe("sessão anônima", () => {
  it("o mesmo segredo volta à mesma loja; outro segredo abre outra loja", async () => {
    expect(await findStoreIdByToken(a.token)).toBe(a.storeId);
    expect(await ensureStoreForToken(a.token)).toBe(a.storeId);
    expect(a.storeId).not.toBe(b.storeId);
  });

  it("primeiras gravações simultâneas com o mesmo segredo criam uma só loja", async () => {
    const token = generateSessionToken();
    const ids = await Promise.all(Array.from({ length: 6 }, () => ensureStoreForToken(token)));
    createdStores.push(ids[0]!);
    expect(new Set(ids).size).toBe(1);
  });

  it("segredo desconhecido não encontra loja", async () => {
    expect(await findStoreIdByToken(generateSessionToken())).toBeNull();
  });

  it("o banco guarda apenas o hash do segredo", async () => {
    const { data } = await supabaseAdmin().from("store_sessions").select("token_hash").eq("store_id", a.storeId);
    expect(data).toHaveLength(1);
    expect(data![0]!.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(data![0]!.token_hash).not.toBe(a.token);
  });
});

describe("rascunho de produto", () => {
  let productId: string;

  it("salva rascunho incompleto e o reencontra com unidades preservadas", async () => {
    const saved = await saveDraft(a.storeId, null, {
      expectedRevision: null,
      ...draft({ name: "Teste Integração", volume_ml: "700", abv_percent: "40,5", price: "79,00", producer_name: "Engenho Teste", state: "MG" }),
    });
    productId = saved.id;
    expect(saved.revision).toBe(1);

    const read = await getProductForEdit(a.storeId, productId);
    expect(read?.product).toMatchObject({
      name: "Teste Integração",
      status: "draft",
      price_brl_cents: 7900,
      attributes: { volume_ml: 700, abv_percent: 40.5 },
    });
    expect(await getStoreOrigin(a.storeId)).toMatchObject({ producer_name: "Engenho Teste", state: "MG" });
    expect((await listProducts(a.storeId)).map((p) => p.id)).toEqual([productId]);
  });

  it("atualiza com a revisão esperada e recusa revisão obsoleta", async () => {
    const next = await saveDraft(a.storeId, productId, { expectedRevision: 1, ...draft({ name: "Teste 2" }) });
    expect(next.revision).toBe(2);
    await expectProductError(saveDraft(a.storeId, productId, { expectedRevision: 1, ...draft({ name: "obsoleto" }) }), "revision_conflict");
    expect((await getProductForEdit(a.storeId, productId))?.product.name).toBe("Teste 2");
  });

  it("outra loja não lê, não edita e não lista o rascunho", async () => {
    expect(await getProductForEdit(b.storeId, productId)).toBeNull();
    expect(await listProducts(b.storeId)).toEqual([]);
    await expectProductError(saveDraft(b.storeId, productId, { expectedRevision: 2, ...draft({ name: "invasão" }) }), "not_found");
    expect((await getProductForEdit(a.storeId, productId))?.product.name).toBe("Teste 2");
  });

  it("aceita até três fotos, define a principal e compacta ao remover", async () => {
    const file = { bytes: JPEG, contentType: "image/jpeg" as const, width: 1, height: 1 };
    await addImage(a.storeId, productId, file);
    await addImage(a.storeId, productId, file);
    const three = await addImage(a.storeId, productId, file);
    expect(three.map((i) => i.position)).toEqual([0, 1, 2]);
    expect(three.every((i) => i.url?.startsWith("http"))).toBe(true);

    await expectProductError(addImage(a.storeId, productId, file), "image_limit_reached");

    const third = three[2]!.id;
    const reordered = await setPrimaryImage(a.storeId, productId, third);
    expect(reordered[0]!.id).toBe(third);

    const afterRemove = await removeImage(a.storeId, productId, three[0]!.id);
    expect(afterRemove.map((i) => i.position)).toEqual([0, 1]);
    expect(afterRemove[0]!.id).toBe(third);

    const list = await listProducts(a.storeId);
    expect(list[0]).toMatchObject({ imageCount: 2 });
    expect(list[0]!.thumbnailUrl).toMatch(/^http/);
  });

  it("a URL assinada entrega a foto; o caminho público do bucket não", async () => {
    const [image] = await listImages(a.storeId, productId);
    const signed = await fetch(image!.url!);
    expect(signed.status).toBe(200);
    expect(signed.headers.get("content-type")).toContain("image/jpeg");

    const { data } = await supabaseAdmin().from("product_images").select("storage_path").eq("id", image!.id).single();
    const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${data!.storage_path}`;
    expect((await fetch(publicUrl)).ok).toBe(false);
  });

  it("outra loja não envia, reordena nem remove fotos deste produto", async () => {
    const file = { bytes: JPEG, contentType: "image/jpeg" as const, width: 1, height: 1 };
    const [first] = await listImages(a.storeId, productId);
    await expectProductError(addImage(b.storeId, productId, file), "not_found");
    await expectProductError(setPrimaryImage(b.storeId, productId, first!.id), "not_found");
    await expectProductError(removeImage(b.storeId, productId, first!.id), "not_found");
    expect(await listImages(a.storeId, productId)).toHaveLength(2);
  });

  it("a chave publicável não lê nenhuma tabela", async () => {
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!key) return;
    for (const table of ["stores", "store_sessions", "products", "product_images"]) {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      const body = res.ok ? ((await res.json()) as unknown[]) : [];
      expect(body).toEqual([]);
    }
  });
});
