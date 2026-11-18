import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "invalid_request"
  | "forbidden_origin"
  | "not_found"
  | "revision_conflict"
  | "image_limit_reached"
  | "unsupported_image"
  | "image_too_large"
  | "storage_failed"
  | "missing_requirements"
  | "generation_in_progress"
  | "adaptation_stale"
  | "adaptation_not_ready"
  | "missing_producer"
  | "product_unavailable"
  | "version_changed"
  | "token_conflict"
  | "conversation_full"
  | "translation_stale"
  | "translation_failed"
  | "translation_in_progress"
  | "order_mismatch"
  | "intro_missing"
  | "server_error";

export function apiError(status: number, code: ApiErrorCode, message: string, details?: unknown) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/**
 * Mutação só a partir da própria origem. Complementa o cookie SameSite=Lax.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
