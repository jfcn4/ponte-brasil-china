import "server-only";
import { headers } from "next/headers";
import { serverEnv } from "./env.server";

/**
 * Origem usada nos links e QRs públicos. Ordem: APP_URL; domínio de produção
 * da Vercel; host da própria requisição.
 */
export async function publicOrigin(): Promise<string> {
  const env = serverEnv();
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export function productPath(slug: string) {
  return `/p/${slug}`;
}
