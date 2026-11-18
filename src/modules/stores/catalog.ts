import "server-only";
import { logEvent } from "@/lib/log";
import { publicOrigin, storePath } from "@/lib/public-url";
import { qrFor } from "@/lib/qr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { PresentationSnapshot } from "@/modules/products/presentation";
import { signPaths } from "@/modules/products/repository";
import {
  StoreIntro,
  StorePublicProfile,
  buildCatalogView,
  catalogItemFromSnapshot,
  type StoreCatalogView,
} from "./catalog-view";

export class StoreError extends Error {
  constructor(
    readonly code: "not_found" | "revision_conflict" | "order_mismatch" | "intro_missing" | "adaptation_not_ready",
    message?: string,
  ) {
    super(message ?? code);
  }
}

function mapRpcError(message: string | undefined): StoreError | null {
  if (!message) return null;
  if (message.includes("revision_conflict")) return new StoreError("revision_conflict");
  if (message.includes("order_mismatch")) return new StoreError("order_mismatch");
  if (message.includes("store_not_found")) return new StoreError("not_found");
  if (message.includes("intro_missing")) return new StoreError("intro_missing");
  if (message.includes("adaptation_not_ready")) return new StoreError("adaptation_not_ready");
  return null;
}

type StoreRow = {
  id: string;
  public_slug: string | null;
  public_profile: unknown;
  intro: unknown;
  catalog_revision: number;
  published_at: string | null;
};

const STORE_COLUMNS = "id, public_slug, public_profile, intro, catalog_revision, published_at";

function parseStore(row: StoreRow) {
  const profile = row.public_profile ? StorePublicProfile.safeParse(row.public_profile) : null;
  const intro = row.intro ? StoreIntro.safeParse(row.intro) : null;
  return {
    id: row.id,
    publicSlug: row.public_slug,
    profile: profile?.success ? profile.data : null,
    intro: intro?.success ? intro.data : null,
    catalogRevision: row.catalog_revision,
    publishedAt: row.published_at,
  };
}

// ---------------------------------------------------------------------------
// Leitura pública (sem sessão): só produtos publicados, na ordem da loja
// ---------------------------------------------------------------------------

async function catalogFor(store: ReturnType<typeof parseStore>): Promise<StoreCatalogView | null> {
  if (!store.publicSlug || !store.profile) return null;
  const { data, error } = await supabaseAdmin()
    .from("products")
    .select(
      "id, public_slug, position, " +
        "current:presentations!products_published_presentation_fkey(id, snapshot, presentation_images(position, storage_path))",
    )
    .eq("store_id", store.id)
    .not("published_presentation_id", "is", null)
    .order("position", { ascending: true });
  if (error) throw new Error(`catalog_read_failed: ${error.code}`);

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    public_slug: string | null;
    current: { id: string; snapshot: unknown; presentation_images: Array<{ position: number; storage_path: string }> } | null;
  }>;
  const published = rows.flatMap((row) => {
    if (!row.current || !row.public_slug) return [];
    const snapshot = PresentationSnapshot.safeParse(row.current.snapshot);
    if (!snapshot.success) {
      logEvent("catalog.snapshot_invalid", { storeId: store.id, productId: row.id });
      return [];
    }
    const cover = row.current.presentation_images.find((img) => img.position === 0)?.storage_path ?? null;
    return [{ slug: row.public_slug, snapshot: snapshot.data, cover }];
  });

  const urls = await signPaths(published.flatMap((p) => (p.cover ? [p.cover] : [])));
  return buildCatalogView({
    slug: store.publicSlug,
    profile: store.profile,
    intro: store.intro,
    items: published.map((p) => catalogItemFromSnapshot(p.slug, p.snapshot, p.cover ? (urls.get(p.cover) ?? null) : null)),
  });
}

/** Catálogo pelo endereço público. Null se o código não existe. */
export async function getPublicCatalog(slug: string): Promise<StoreCatalogView | null> {
  if (!/^[a-z0-9]{10}$/.test(slug)) return null;
  const { data, error } = await supabaseAdmin().from("stores").select(STORE_COLUMNS).eq("public_slug", slug).maybeSingle();
  if (error) throw new Error(`public_store_read_failed: ${error.code}`);
  if (!data) return null;
  return catalogFor(parseStore(data as StoreRow));
}

/** Endereço e nome aprovados de uma loja (retorno da vitrine ao catálogo). */
export function publicStoreLink(row: { public_slug: string | null; public_profile: unknown } | null): {
  slug: string;
  producer: string;
} | null {
  if (!row?.public_slug || !row.public_profile) return null;
  const profile = StorePublicProfile.safeParse(row.public_profile);
  return profile.success ? { slug: row.public_slug, producer: profile.data.name } : null;
}

/** Apresentação aprovada e endereço da loja, numa leitura (laboratório do produto). */
export async function getStoreIntroAndLink(storeId: string) {
  const { data, error } = await supabaseAdmin().from("stores").select(STORE_COLUMNS).eq("id", storeId).maybeSingle();
  if (error) throw new Error(`store_read_failed: ${error.code}`);
  if (!data) return { intro: null, link: null };
  const store = parseStore(data as StoreRow);
  return {
    intro: store.intro,
    link: store.publicSlug && store.profile ? { slug: store.publicSlug, producer: store.profile.name } : null,
  };
}

// ---------------------------------------------------------------------------
// Gestão (sempre pela loja da sessão)
// ---------------------------------------------------------------------------

export type StoreOverview = {
  catalogRevision: number;
  /** Ausente até a primeira publicação de um produto. */
  public: {
    slug: string;
    url: string;
    qrSvg: string;
    qrPngDataUrl: string;
    profile: StorePublicProfile;
    intro: StoreIntro | null;
    publishedAt: string | null;
    catalog: StoreCatalogView;
  } | null;
};

export async function getStoreOverview(storeId: string): Promise<StoreOverview | null> {
  const { data, error } = await supabaseAdmin().from("stores").select(STORE_COLUMNS).eq("id", storeId).maybeSingle();
  if (error) throw new Error(`store_read_failed: ${error.code}`);
  if (!data) return null;
  const store = parseStore(data as StoreRow);
  const catalog = await catalogFor(store);
  if (!catalog || !store.publicSlug || !store.profile) return { catalogRevision: store.catalogRevision, public: null };

  const url = `${await publicOrigin()}${storePath(store.publicSlug)}`;
  const qr = await qrFor(url);
  return {
    catalogRevision: store.catalogRevision,
    public: {
      slug: store.publicSlug,
      url,
      qrSvg: qr.svg,
      qrPngDataUrl: qr.pngDataUrl,
      profile: store.profile,
      intro: store.intro,
      publishedAt: store.publishedAt,
      catalog,
    },
  };
}

export async function getCatalogRevision(storeId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().from("stores").select("catalog_revision").eq("id", storeId).maybeSingle();
  if (error) throw new Error(`store_read_failed: ${error.code}`);
  return (data?.catalog_revision as number | undefined) ?? 1;
}

/**
 * Aplica a nova ordem de todos os produtos da loja (rascunhos inclusive).
 * Não altera revisão nem versão publicada de nenhum produto: os links e QRs
 * continuam os mesmos; só a ordem do catálogo e o destaque mudam.
 */
export async function reorderProducts(
  storeId: string,
  productIds: string[],
  expectedRevision: number,
): Promise<{ catalogRevision: number }> {
  const started = Date.now();
  const { data, error } = await supabaseAdmin().rpc("reorder_products", {
    p_store_id: storeId,
    p_product_ids: productIds,
    p_expected_revision: expectedRevision,
  });
  if (error || typeof data !== "number") {
    const mapped = mapRpcError(error?.message);
    logEvent("store.reorder_failed", { storeId, code: mapped?.code ?? error?.code ?? "no_data" });
    if (mapped) throw mapped;
    throw new Error(`reorder_failed: ${error?.code ?? "no_data"}`);
  }
  logEvent("store.reordered", { storeId, count: productIds.length, revision: data, ms: Date.now() - started });
  return { catalogRevision: data };
}

/** Aprova, como apresentação da loja, o texto gerado numa adaptação desta loja. */
export async function approveStoreIntro(storeId: string, adaptationId: string): Promise<StoreIntro> {
  const { data, error } = await supabaseAdmin().rpc("approve_store_intro", {
    p_store_id: storeId,
    p_adaptation_id: adaptationId,
  });
  if (error) {
    const mapped = mapRpcError(error.message);
    logEvent("store.intro_approve_failed", { storeId, adaptationId, code: mapped?.code ?? error.code });
    if (mapped) throw mapped;
    throw new Error(`intro_approve_failed: ${error.code}`);
  }
  logEvent("store.intro_approved", { storeId, adaptationId });
  return StoreIntro.parse(data);
}
