import "server-only";
import { serverEnv } from "@/lib/env.server";
import { logEvent } from "@/lib/log";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  ProductRow,
  StoreOrigin,
  type DisplayStatus,
  type ProductImageView,
  type SaveDraftRequest,
} from "./schema";

const SIGNED_URL_TTL_SECONDS = 60 * 60;

export class ProductError extends Error {
  constructor(
    readonly code: "not_found" | "revision_conflict" | "image_limit_reached" | "storage_failed",
    message?: string,
  ) {
    super(message ?? code);
  }
}

function mapRpcError(message: string | undefined): ProductError | null {
  if (!message) return null;
  if (message.includes("revision_conflict")) return new ProductError("revision_conflict");
  if (message.includes("product_not_found") || message.includes("image_not_found")) return new ProductError("not_found");
  if (message.includes("image_limit_reached")) return new ProductError("image_limit_reached");
  return null;
}

// ---------------------------------------------------------------------------
// Leitura (sempre filtrada pela loja da sessão)
// ---------------------------------------------------------------------------

export type ProductListItem = {
  id: string;
  name: string | null;
  status: DisplayStatus;
  publicSlug: string | null;
  publishedVersion: number | null;
  position: number;
  updatedAt: string;
  thumbnailUrl: string | null;
  imageCount: number;
  priceBrlCents: number | null;
  volumeMl: number | null;
};

export async function listProducts(storeId: string): Promise<ProductListItem[]> {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("products")
    .select(
      "id, name, status, revision, media_revision, public_slug, position, updated_at, price_brl_cents, attributes, product_images(storage_path, position), " +
        "current:presentations!products_published_presentation_fkey(version, source_revision, source_media_revision)",
    )
    .eq("store_id", storeId)
    .order("position", { ascending: true });
  if (error) throw new Error(`products_list_failed: ${error.code}`);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    name: string | null;
    status: "draft" | "published" | "withdrawn";
    revision: number;
    media_revision: number;
    public_slug: string | null;
    position: number;
    updated_at: string;
    price_brl_cents: number | null;
    attributes: { volume_ml?: number | null } | null;
    product_images: Array<{ storage_path: string; position: number }>;
    current: { version: number; source_revision: number; source_media_revision: number } | null;
  }>;

  const primaryPaths = rows
    .map((row) => row.product_images.find((img) => img.position === 0)?.storage_path)
    .filter((p): p is string => Boolean(p));
  const urls = await signPaths(primaryPaths);

  return rows.map((row) => {
    const primary = row.product_images.find((img) => img.position === 0);
    const pending =
      row.current !== null &&
      (row.current.source_revision !== row.revision || row.current.source_media_revision !== row.media_revision);
    return {
      id: row.id,
      name: row.name,
      status: row.current ? (pending ? "pending" : "published") : row.status === "withdrawn" ? "withdrawn" : "draft",
      publicSlug: row.current ? row.public_slug : null,
      publishedVersion: row.current?.version ?? null,
      position: row.position,
      updatedAt: row.updated_at,
      thumbnailUrl: primary ? (urls.get(primary.storage_path) ?? null) : null,
      imageCount: row.product_images.length,
      priceBrlCents: row.price_brl_cents,
      volumeMl: row.attributes?.volume_ml ?? null,
    };
  });
}

export async function getProductForEdit(
  storeId: string,
  productId: string,
): Promise<{ product: ProductRow; images: ProductImageView[] } | null> {
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select("*")
    .eq("id", productId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(`product_read_failed: ${error.code}`);
  if (!data) return null;
  return { product: ProductRow.parse(data), images: await listImages(storeId, productId) };
}

export async function getStoreOrigin(storeId: string | null): Promise<StoreOrigin | null> {
  if (!storeId) return null;
  const { data, error } = await supabaseAdmin()
    .from("stores")
    .select("producer_name, city, state, region")
    .eq("id", storeId)
    .maybeSingle();
  if (error) throw new Error(`store_read_failed: ${error.code}`);
  return data ? StoreOrigin.parse({ ...data, state: data.state?.trim() ?? null }) : null;
}

// ---------------------------------------------------------------------------
// Rascunho
// ---------------------------------------------------------------------------

export async function saveDraft(
  storeId: string,
  productId: string | null,
  request: SaveDraftRequest,
): Promise<{ id: string; revision: number; updatedAt: string }> {
  const started = Date.now();
  const { data, error } = await supabaseAdmin().rpc("save_product_draft", {
    p_store_id: storeId,
    p_product_id: productId,
    p_expected_revision: productId ? request.expectedRevision : null,
    p_product: request.product,
    p_store: request.store,
  });

  if (error) {
    const mapped = mapRpcError(error.message);
    logEvent("product.draft_save_failed", { storeId, productId, code: mapped?.code ?? error.code });
    if (mapped) throw mapped;
    throw new Error(`product_save_failed: ${error.code}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as { id: string; revision: number; updated_at: string } | undefined;
  if (!row) throw new Error("product_save_failed: no_row");
  logEvent("product.draft_saved", { storeId, productId: row.id, revision: row.revision, ms: Date.now() - started });
  return { id: row.id, revision: row.revision, updatedAt: row.updated_at };
}

// ---------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------

export const ACCEPTED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;
export type AcceptedImageType = keyof typeof ACCEPTED_IMAGE_TYPES;

/** Abaixo do limite de corpo das funções da Vercel (4,5 MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/** Confere a assinatura do arquivo em vez de confiar no tipo declarado. */
export function sniffImageType(bytes: Uint8Array): AcceptedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;
  const { data, error } = await supabaseAdmin()
    .storage.from(serverEnv().SUPABASE_STORAGE_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (error) {
    logEvent("storage.sign_failed", { count: paths.length, code: error.name });
    return result;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) result.set(item.path, item.signedUrl);
  }
  return result;
}

export async function listImages(storeId: string, productId: string): Promise<ProductImageView[]> {
  const { data, error } = await supabaseAdmin()
    .from("product_images")
    .select("id, position, storage_path, width, height")
    .eq("store_id", storeId)
    .eq("product_id", productId)
    .order("position", { ascending: true });
  if (error) throw new Error(`images_list_failed: ${error.code}`);
  const rows = data ?? [];
  const urls = await signPaths(rows.map((r) => r.storage_path));
  return rows.map((r) => ({
    id: r.id,
    position: r.position,
    url: urls.get(r.storage_path) ?? null,
    width: r.width,
    height: r.height,
  }));
}

export async function addImage(
  storeId: string,
  productId: string,
  file: { bytes: Uint8Array; contentType: AcceptedImageType; width: number | null; height: number | null },
): Promise<ProductImageView[]> {
  const started = Date.now();
  const db = supabaseAdmin();

  // Falha cedo, sem enviar ao Storage, se o produto não é desta loja ou já tem 3 fotos.
  const { count, error: countError } = await db
    .from("product_images")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("product_id", productId);
  if (countError) throw new Error(`images_count_failed: ${countError.code}`);
  const { data: owned, error: ownedError } = await db
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (ownedError) throw new Error(`product_read_failed: ${ownedError.code}`);
  if (!owned) throw new ProductError("not_found");
  if ((count ?? 0) >= 3) throw new ProductError("image_limit_reached");

  const imageId = crypto.randomUUID();
  const storagePath = `stores/${storeId}/products/${productId}/${imageId}.${ACCEPTED_IMAGE_TYPES[file.contentType]}`;
  const bucket = db.storage.from(serverEnv().SUPABASE_STORAGE_BUCKET);

  const upload = await bucket.upload(storagePath, file.bytes, {
    contentType: file.contentType,
    upsert: false,
    cacheControl: "31536000",
  });
  if (upload.error) {
    logEvent("product.image_upload_failed", { storeId, productId, imageId, code: upload.error.name });
    throw new ProductError("storage_failed", upload.error.message);
  }

  const { error } = await db.rpc("add_product_image", {
    p_store_id: storeId,
    p_product_id: productId,
    p_image_id: imageId,
    p_storage_path: storagePath,
    p_content_type: file.contentType,
    p_size_bytes: file.bytes.byteLength,
    p_width: file.width,
    p_height: file.height,
  });
  if (error) {
    // O registro não aconteceu (ex.: quarta foto em envio simultâneo): não deixar órfão no Storage.
    await bucket.remove([storagePath]);
    const mapped = mapRpcError(error.message);
    logEvent("product.image_register_failed", { storeId, productId, imageId, code: mapped?.code ?? error.code });
    if (mapped) throw mapped;
    throw new Error(`image_register_failed: ${error.code}`);
  }

  logEvent("product.image_added", { storeId, productId, imageId, bytes: file.bytes.byteLength, ms: Date.now() - started });
  return listImages(storeId, productId);
}

export async function removeImage(storeId: string, productId: string, imageId: string): Promise<ProductImageView[]> {
  const db = supabaseAdmin();
  const { data: image } = await db
    .from("product_images")
    .select("id")
    .eq("id", imageId)
    .eq("product_id", productId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (!image) throw new ProductError("not_found");

  const { data, error } = await db.rpc("remove_product_image", { p_store_id: storeId, p_image_id: imageId });
  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped) throw mapped;
    throw new Error(`image_remove_failed: ${error.code}`);
  }
  // A chave é imutável: só sai do Storage se nenhuma versão publicada a referencia.
  if (typeof data === "string" && !(await isReferencedByPresentation(data))) {
    const removal = await db.storage.from(serverEnv().SUPABASE_STORAGE_BUCKET).remove([data]);
    if (removal.error) logEvent("storage.remove_failed", { storeId, productId, imageId });
  }
  logEvent("product.image_removed", { storeId, productId, imageId });
  return listImages(storeId, productId);
}

async function isReferencedByPresentation(storagePath: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin()
    .from("presentation_images")
    .select("presentation_id", { count: "exact", head: true })
    .eq("storage_path", storagePath);
  // Na dúvida, preserva o arquivo.
  if (error) return true;
  return (count ?? 0) > 0;
}

/** Linhas das fotos com a chave no Storage (para congelar na publicação). */
export async function listImageRows(storeId: string, productId: string) {
  const { data, error } = await supabaseAdmin()
    .from("product_images")
    .select("id, position, storage_path, width, height")
    .eq("store_id", storeId)
    .eq("product_id", productId)
    .order("position", { ascending: true });
  if (error) throw new Error(`images_list_failed: ${error.code}`);
  return (data ?? []) as Array<{ id: string; position: number; storage_path: string; width: number | null; height: number | null }>;
}

export async function setPrimaryImage(storeId: string, productId: string, imageId: string): Promise<ProductImageView[]> {
  const db = supabaseAdmin();
  const { data: image } = await db
    .from("product_images")
    .select("id")
    .eq("id", imageId)
    .eq("product_id", productId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (!image) throw new ProductError("not_found");

  const { error } = await db.rpc("set_primary_product_image", { p_store_id: storeId, p_image_id: imageId });
  if (error) {
    const mapped = mapRpcError(error.message);
    if (mapped) throw mapped;
    throw new Error(`image_primary_failed: ${error.code}`);
  }
  logEvent("product.image_primary_set", { storeId, productId, imageId });
  return listImages(storeId, productId);
}
