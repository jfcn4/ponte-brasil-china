import "server-only";
import { serverEnv } from "@/lib/env.server";

/** Selo das lojas de demonstração usadas no ensaio e na banca (dados reais, produtor de exemplo). */
export const DEMO_STORE_LABEL = "演示店铺 · Loja de demonstração";

/** Lê DEMO_STORE_SLUGS: lista de códigos de loja (10 caracteres), separados por vírgula. */
export function parseDemoStoreSlugs(raw: string | undefined): ReadonlySet<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => /^[a-z0-9]{10}$/.test(s)),
  );
}

/** A loja deste código está marcada como demonstração na configuração do servidor. */
export function isDemoStore(slug: string | null | undefined): boolean {
  return Boolean(slug) && parseDemoStoreSlugs(serverEnv().DEMO_STORE_SLUGS).has(slug!);
}
