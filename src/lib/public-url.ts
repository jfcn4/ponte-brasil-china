import "server-only";
import { headers } from "next/headers";
import { serverEnv } from "./env.server";
import { logEvent } from "./log";
import { choosePublicOrigin } from "./origin";

let warned = false;

/**
 * Origem usada nos links e QRs públicos. Ordem: APP_URL; domínio de produção
 * da Vercel; host da própria requisição. Na Vercel, APP_URL apontando para
 * localhost é ignorado (e registrado no log).
 */
export async function publicOrigin(): Promise<string> {
  const env = serverEnv();
  const { origin, ignoredAppUrl } = await choosePublicOrigin({
    appUrl: env.APP_URL,
    onVercel: Boolean(process.env.VERCEL),
    productionHost: env.VERCEL_PROJECT_PRODUCTION_URL,
    requestOrigin: async () => {
      const h = await headers();
      const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
      const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
      return `${proto}://${host}`;
    },
  });
  if (ignoredAppUrl && !warned) {
    warned = true;
    logEvent("config.app_url_ignored", { reason: "loopback_on_vercel" });
  }
  return origin;
}

export function productPath(slug: string) {
  return `/p/${slug}`;
}
