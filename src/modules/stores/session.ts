import "server-only";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  STORE_SESSION_COOKIE,
  generateSessionToken,
  hashSessionToken,
  isWellFormedSessionToken,
  sessionCookieOptions,
} from "./token";

/**
 * Loja do navegador atual, apenas para leitura. Não cria loja nem cookie.
 * Retorna null quando este navegador ainda não gravou nada.
 */
export async function findCurrentStoreId(): Promise<string | null> {
  const token = (await cookies()).get(STORE_SESSION_COOKIE)?.value;
  if (!isWellFormedSessionToken(token)) return null;
  return findStoreIdByToken(token);
}

export async function findStoreIdByToken(token: string): Promise<string | null> {
  const tokenHash = await hashSessionToken(token);
  const { data, error } = await supabaseAdmin()
    .from("store_sessions")
    .select("store_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(`store_session_lookup_failed: ${error.code}`);
  return data?.store_id ?? null;
}

/**
 * Loja do navegador atual para gravação. Cria a loja na primeira gravação.
 * O proxy normalmente já emitiu o cookie; se faltar, ele é emitido aqui.
 */
export async function requireStoreIdForWrite(): Promise<string> {
  const jar = await cookies();
  let token = jar.get(STORE_SESSION_COOKIE)?.value;
  if (!isWellFormedSessionToken(token)) {
    token = generateSessionToken();
    jar.set(STORE_SESSION_COOKIE, token, sessionCookieOptions());
  }
  return ensureStoreForToken(token);
}

export async function ensureStoreForToken(token: string): Promise<string> {
  const tokenHash = await hashSessionToken(token);
  const { data, error } = await supabaseAdmin().rpc("ensure_store_session", { p_token_hash: tokenHash });
  if (error || typeof data !== "string") throw new Error(`store_session_ensure_failed: ${error?.code ?? "no_data"}`);
  return data;
}

/** Loja existente deste navegador; nunca cria. Para mutações sobre objetos já existentes. */
export async function requireExistingStoreId(): Promise<string | null> {
  return findCurrentStoreId();
}
