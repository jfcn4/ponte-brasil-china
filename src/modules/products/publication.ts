import "server-only";
import { createHash } from "node:crypto";
import { logEvent } from "@/lib/log";
import { productPath, publicOrigin, storePath } from "@/lib/public-url";
import { qrFor } from "@/lib/qr";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { identityAdapter } from "@/modules/ai";
import type { IdentityAdapter } from "@/modules/ai/adapter";
import {
  IDENTITY_PROMPT_VERSION,
  IDENTITY_SCHEMA_VERSION,
  IdentityOutput,
  buildAdaptationInput,
  canonicalJson,
  validateIdentityOutput,
  type AdaptationInput,
} from "@/modules/ai/identity-contract";
import { TEST_MODEL } from "@/modules/ai/test-adapter";
import { approveStoreIntro, getStoreIntroAndLink, publicStoreLink } from "@/modules/stores/catalog";
import type { LabState } from "./lab-state";
import {
  CHOICES,
  PresentationSnapshot,
  SnapshotError,
  buildSnapshot,
  missingForPublication,
  snapshotToView,
  type Choice,
} from "./presentation";
import { ProductError, getProductForEdit, getStoreOrigin, listImageRows, signPaths } from "./repository";
import { missingForGeneration, rowToDraft, type ProductRow, type StoreOrigin } from "./schema";
import type { ShowcaseView } from "./showcase";

export class PublicationError extends Error {
  constructor(
    readonly code:
      | "missing_requirements"
      | "generation_in_progress"
      | "adaptation_stale"
      | "adaptation_not_ready"
      | "missing_producer",
    message?: string,
  ) {
    super(message ?? code);
  }
}

const MAX_ATTEMPTS = 2;

export function hashAdaptationInput(input: AdaptationInput): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

function rpcError(message: string | undefined): Error | null {
  if (!message) return null;
  if (message.includes("revision_conflict")) return new ProductError("revision_conflict");
  if (message.includes("product_not_found")) return new ProductError("not_found");
  if (message.includes("generation_in_progress")) return new PublicationError("generation_in_progress");
  if (message.includes("adaptation_not_ready")) return new PublicationError("adaptation_not_ready");
  return null;
}

async function loadOwned(storeId: string, productId: string) {
  const data = await getProductForEdit(storeId, productId);
  if (!data) throw new ProductError("not_found");
  const store = (await getStoreOrigin(storeId)) ?? { producer_name: null, city: null, state: null, region: null };
  return { ...data, store, draft: rowToDraft(data.product) };
}

async function logAiCall(row: {
  storeId: string;
  productId: string;
  adaptationId: string;
  model: string;
  attempt: number;
  status: "ok" | "invalid_output" | "provider_error" | "timeout" | "not_configured";
  durationMs: number;
  detail?: string;
}) {
  const { error } = await supabaseAdmin().from("ai_calls").insert({
    store_id: row.storeId,
    product_id: row.productId,
    adaptation_id: row.adaptationId,
    operation: "identity",
    prompt_version: IDENTITY_PROMPT_VERSION,
    schema_version: IDENTITY_SCHEMA_VERSION,
    model: row.model,
    attempt: row.attempt,
    status: row.status,
    duration_ms: row.durationMs,
    detail: row.detail?.slice(0, 300) ?? null,
  });
  logEvent("ai.call", {
    op: "identity",
    adaptationId: row.adaptationId,
    model: row.model,
    attempt: row.attempt,
    status: row.status,
    ms: row.durationMs,
    logged: !error,
  });
}

// ---------------------------------------------------------------------------
// Operação 1: gerar nomes e conteúdo da vitrine
// ---------------------------------------------------------------------------

/**
 * Gera a adaptação a partir do rascunho salvo na revisão informada. A entrada
 * é gravada antes da chamada; a saída só é aceita se passar pelo contrato.
 * Falha nunca altera o rascunho nem a versão publicada.
 */
export async function generateAdaptation(
  storeId: string,
  productId: string,
  expectedRevision: number,
  adapter: IdentityAdapter = identityAdapter(),
): Promise<{ adaptationId: string; status: "ready" | "failed"; errorCode: string | null }> {
  const { product, images, store, draft } = await loadOwned(storeId, productId);
  if (product.revision !== expectedRevision) throw new ProductError("revision_conflict");
  const missing = missingForGeneration({ name: draft.name, short_description: draft.short_description, imageCount: images.length });
  if (missing.length > 0) throw new PublicationError("missing_requirements", missing.join(","));

  const input = buildAdaptationInput(draft, store);
  const { data: adaptationId, error } = await supabaseAdmin().rpc("start_adaptation", {
    p_store_id: storeId,
    p_product_id: productId,
    p_expected_revision: expectedRevision,
    p_input: input,
    p_input_hash: hashAdaptationInput(input),
    p_prompt_version: IDENTITY_PROMPT_VERSION,
    p_model: adapter.model,
  });
  if (error || typeof adaptationId !== "string") {
    const mapped = rpcError(error?.message);
    if (mapped) throw mapped;
    throw new Error(`adaptation_start_failed: ${error?.code ?? "no_id"}`);
  }

  let output: IdentityOutput | null = null;
  let errorCode: "invalid_output" | "provider_error" | "timeout" | "not_configured" = "provider_error";
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const started = Date.now();
      const result = await adapter.generateIdentity(input, attempt);
      const durationMs = Date.now() - started;
      if (result.kind === "error") {
        errorCode = result.code;
        await logAiCall({ storeId, productId, adaptationId, model: adapter.model, attempt, status: result.code, durationMs, detail: result.detail });
        break; // falha do provedor: o produtor decide quando repetir
      }
      const checked = validateIdentityOutput(result.raw, input);
      if (checked.ok) {
        output = checked.output;
        await logAiCall({ storeId, productId, adaptationId, model: adapter.model, attempt, status: "ok", durationMs });
        break;
      }
      errorCode = "invalid_output";
      await logAiCall({
        storeId,
        productId,
        adaptationId,
        model: adapter.model,
        attempt,
        status: "invalid_output",
        durationMs,
        detail: checked.issues.join(" | "),
      });
    }
  } finally {
    const { error: finishError } = await supabaseAdmin().rpc("finish_adaptation", {
      p_store_id: storeId,
      p_adaptation_id: adaptationId,
      p_output: output,
      p_error_code: output ? null : errorCode,
    });
    if (finishError) logEvent("adaptation.finish_failed", { adaptationId, code: finishError.code });
  }

  logEvent("adaptation.finished", { storeId, productId, adaptationId, revision: expectedRevision, status: output ? "ready" : "failed" });
  return { adaptationId, status: output ? "ready" : "failed", errorCode: output ? null : errorCode };
}

// ---------------------------------------------------------------------------
// Laboratório e revisão
// ---------------------------------------------------------------------------

type AdaptationRow = {
  id: string;
  status: "generating" | "ready" | "failed";
  input_hash: string;
  output: unknown;
  error_code: string | null;
  model: string | null;
  created_at: string;
};

type PresentationRow = {
  id: string;
  version: number;
  adaptation_id: string;
  choice: Choice;
  source_revision: number;
  source_media_revision: number;
  snapshot: unknown;
  published_at: string;
};

function sameOrigin(snapshot: PresentationSnapshot, store: StoreOrigin) {
  const p = snapshot.producer;
  return p.name === store.producer_name && p.city === store.city && p.state === store.state && p.region === store.region;
}

async function currentPresentation(product: ProductRow): Promise<PresentationRow | null> {
  if (!product.published_presentation_id) return null;
  const { data, error } = await supabaseAdmin()
    .from("presentations")
    .select("id, version, adaptation_id, choice, source_revision, source_media_revision, snapshot, published_at")
    .eq("id", product.published_presentation_id)
    .eq("product_id", product.id)
    .maybeSingle();
  if (error) throw new Error(`presentation_read_failed: ${error.code}`);
  return (data as PresentationRow | null) ?? null;
}

export async function getLabState(storeId: string, productId: string): Promise<LabState | null> {
  const owned = await getProductForEdit(storeId, productId);
  if (!owned) return null;
  const { product, images } = owned;
  const store = (await getStoreOrigin(storeId)) ?? { producer_name: null, city: null, state: null, region: null };
  const draft = rowToDraft(product);

  const { data: rows, error } = await supabaseAdmin()
    .from("adaptations")
    .select("id, status, input_hash, output, error_code, model, created_at")
    .eq("product_id", productId)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(`adaptations_read_failed: ${error.code}`);
  const adaptations = (rows ?? []) as AdaptationRow[];

  const generationMissing = missingForGeneration({
    name: draft.name,
    short_description: draft.short_description,
    imageCount: images.length,
  });
  const currentHash = generationMissing.includes("name") || generationMissing.includes("short_description")
    ? null
    : hashAdaptationInput(buildAdaptationInput(draft, store));

  const latestRow = adaptations[0] ?? null;
  const usableRow = adaptations.find((a) => a.status === "ready" && a.input_hash === currentHash) ?? null;
  const usableOutput = usableRow ? IdentityOutput.safeParse(usableRow.output) : null;

  const presentation = await currentPresentation(product);
  let published: LabState["published"] = null;
  if (presentation && product.public_slug) {
    const snapshot = PresentationSnapshot.parse(presentation.snapshot);
    const url = `${await publicOrigin()}${productPath(product.public_slug)}`;
    const qr = await qrFor(url);
    published = {
      version: presentation.version,
      choice: presentation.choice,
      adaptationId: presentation.adaptation_id,
      title: snapshot.name.display,
      publishedAt: presentation.published_at,
      pending:
        presentation.source_revision !== product.revision ||
        presentation.source_media_revision !== product.media_revision ||
        !sameOrigin(snapshot, store),
      url,
      qrSvg: qr.svg,
      qrPngDataUrl: qr.pngDataUrl,
    };
  }

  const { intro: storeIntro, link } = await getStoreIntroAndLink(storeId);
  const storeLink = presentation ? link : null;

  return {
    product: {
      id: product.id,
      name: product.name,
      revision: product.revision,
      mediaRevision: product.media_revision,
      status: published ? (published.pending ? "pending" : "published") : product.status === "withdrawn" ? "withdrawn" : "draft",
    },
    draft,
    store,
    images,
    generationMissing,
    publicationMissing: missingForPublication({ store, imageCount: images.length }),
    latest: latestRow
      ? {
          id: latestRow.id,
          status: latestRow.status,
          errorCode: latestRow.error_code,
          createdAt: latestRow.created_at,
          isCurrent: latestRow.input_hash === currentHash,
        }
      : null,
    usable:
      usableRow && usableOutput?.success
        ? {
            id: usableRow.id,
            model: usableRow.model,
            isTestAdapter: usableRow.model === TEST_MODEL,
            createdAt: usableRow.created_at,
            output: usableOutput.data,
          }
        : null,
    hasStaleReady: !usableRow && adaptations.some((a) => a.status === "ready"),
    published,
    storeIntro: storeIntro ? { zh: storeIntro.zh, pt: storeIntro.pt, adaptationId: storeIntro.adaptation_id } : null,
    storeUrl: storeLink ? `${await publicOrigin()}${storePath(storeLink.slug)}` : null,
  };
}

// ---------------------------------------------------------------------------
// Publicação
// ---------------------------------------------------------------------------

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function newPublicSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
}

export type PublishRequest = {
  adaptationId: string;
  choice: Choice;
  expectedRevision: number;
  expectedMediaRevision: number;
  /** O produtor aprovou também a apresentação da loja gerada nesta adaptação. */
  approveStoreIntro?: boolean;
};

/**
 * Publica a versão revisada. O snapshot é montado no servidor com os dados
 * gravados (nunca com o que o navegador envia) pela mesma função da prévia.
 */
export async function publishProduct(
  storeId: string,
  productId: string,
  request: PublishRequest,
): Promise<{ version: number; slug: string; created: boolean; storeIntroApproved: boolean }> {
  if (!(CHOICES as readonly string[]).includes(request.choice)) throw new PublicationError("adaptation_not_ready");
  const { store, draft } = await loadOwned(storeId, productId);

  const { data: adaptation, error } = await supabaseAdmin()
    .from("adaptations")
    .select("id, status, input_hash, output")
    .eq("id", request.adaptationId)
    .eq("product_id", productId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw new Error(`adaptation_read_failed: ${error.code}`);
  if (!adaptation || adaptation.status !== "ready") throw new PublicationError("adaptation_not_ready");
  if (!draft.name || !draft.short_description) throw new PublicationError("missing_requirements");
  if (adaptation.input_hash !== hashAdaptationInput(buildAdaptationInput(draft, store))) {
    throw new PublicationError("adaptation_stale");
  }

  const imageRows = await listImageRows(storeId, productId);
  if (missingForPublication({ store, imageCount: imageRows.length }).includes("producer_name")) {
    throw new PublicationError("missing_producer");
  }
  if (imageRows.length === 0) throw new PublicationError("missing_requirements", "image");

  let snapshot: PresentationSnapshot;
  try {
    snapshot = PresentationSnapshot.parse(
      buildSnapshot({ product: draft, store, output: IdentityOutput.parse(adaptation.output), choice: request.choice }),
    );
  } catch (cause) {
    if (cause instanceof SnapshotError && cause.code === "missing_producer") throw new PublicationError("missing_producer");
    throw cause;
  }

  const started = Date.now();
  const { data, error: publishError } = await supabaseAdmin().rpc("publish_presentation", {
    p_store_id: storeId,
    p_product_id: productId,
    p_adaptation_id: request.adaptationId,
    p_choice: request.choice,
    p_expected_revision: request.expectedRevision,
    p_expected_media_revision: request.expectedMediaRevision,
    p_snapshot: snapshot,
    p_images: imageRows.map((img) => ({
      position: img.position,
      storage_path: img.storage_path,
      width: img.width,
      height: img.height,
    })),
    p_slug_candidate: newPublicSlug(),
  });
  if (publishError) {
    const mapped = rpcError(publishError.message);
    logEvent("product.publish_failed", { storeId, productId, code: mapped?.message ?? publishError.code });
    if (mapped) throw mapped;
    throw new Error(`publish_failed: ${publishError.code}`);
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { presentation_id: string; version: number; public_slug: string; created: boolean }
    | undefined;
  if (!row) throw new Error("publish_failed: no_row");

  // A apresentação da loja é um objeto à parte: aprovada depois da publicação,
  // de forma repetível (repetir a confirmação conclui o que faltou).
  const output = IdentityOutput.parse(adaptation.output);
  let storeIntroApproved = false;
  if (request.approveStoreIntro && output.store_intro) {
    await approveStoreIntro(storeId, request.adaptationId);
    storeIntroApproved = true;
  }

  logEvent("product.published", {
    storeId,
    productId,
    presentationId: row.presentation_id,
    version: row.version,
    revision: request.expectedRevision,
    created: row.created,
    ms: Date.now() - started,
  });
  return { version: row.version, slug: row.public_slug, created: row.created, storeIntroApproved };
}

// ---------------------------------------------------------------------------
// Leitura pública (sem sessão): só a versão apontada
// ---------------------------------------------------------------------------

export type PublicStoreLink = { slug: string; producer: string } | null;

export type PublicProduct =
  | { state: "published"; version: number; view: ShowcaseView; snapshot: PresentationSnapshot; store: PublicStoreLink }
  | { state: "unavailable"; store: PublicStoreLink };

export async function getPublicProduct(slug: string): Promise<PublicProduct | null> {
  if (!/^[a-z0-9]{10}$/.test(slug)) return null;
  const db = supabaseAdmin();
  const { data: product, error } = await db
    .from("products")
    .select("id, published_presentation_id, store:stores(public_slug, public_profile)")
    .eq("public_slug", slug)
    .maybeSingle();
  if (error) throw new Error(`public_product_read_failed: ${error.code}`);
  if (!product) return null;
  const store = publicStoreLink(
    (product as unknown as { store: { public_slug: string | null; public_profile: unknown } | null }).store,
  );
  if (!product.published_presentation_id) return { state: "unavailable", store };

  const { data: presentation, error: presentationError } = await db
    .from("presentations")
    .select("id, version, snapshot, presentation_images(position, storage_path)")
    .eq("id", product.published_presentation_id)
    .eq("product_id", product.id)
    .maybeSingle();
  if (presentationError) throw new Error(`public_presentation_read_failed: ${presentationError.code}`);
  if (!presentation) return { state: "unavailable", store };

  const snapshot = PresentationSnapshot.parse(presentation.snapshot);
  const frozen = ((presentation.presentation_images ?? []) as Array<{ position: number; storage_path: string }>).sort(
    (a, b) => a.position - b.position,
  );
  const urls = await signPaths(frozen.map((img) => img.storage_path));
  const view = snapshotToView(
    snapshot,
    frozen.map((img) => ({ id: `${presentation.id}-${img.position}`, url: urls.get(img.storage_path) ?? null })),
  );
  return { state: "published", version: presentation.version, view, snapshot, store };
}
