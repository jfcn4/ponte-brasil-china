import { createHash } from "node:crypto";
import type { BrowserContext } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

/** Remove a loja (e as fotos) criada pela sessão deste contexto de navegador. */
export async function cleanupStoreOf(context: BrowserContext) {
  const token = (await context.cookies()).find((c) => c.name === "pg_store_session")?.value;
  if (!token) return;
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  });
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: session } = await db.from("store_sessions").select("store_id").eq("token_hash", hash).maybeSingle();
  if (!session) return;
  const { data: images } = await db.from("product_images").select("storage_path").eq("store_id", session.store_id);
  const paths = (images ?? []).map((i) => i.storage_path);
  if (paths.length) await db.storage.from(process.env.SUPABASE_STORAGE_BUCKET!).remove(paths);
  await db.from("stores").delete().eq("id", session.store_id);
}
