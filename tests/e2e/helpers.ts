import { createHash } from "node:crypto";
import { expect, type BrowserContext, type Page } from "@playwright/test";
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
  const { data: frozen } = await db
    .from("presentation_images")
    .select("storage_path, presentations!inner(store_id)")
    .eq("presentations.store_id", session.store_id);
  const paths = [...new Set([...(images ?? []), ...(frozen ?? [])].map((i) => i.storage_path as string))];
  if (paths.length) await db.storage.from(process.env.SUPABASE_STORAGE_BUCKET!).remove(paths);
  await db.from("stores").delete().eq("id", session.store_id);
}

/** Preenche a origem em Minha loja (produtor, cidade opcional) e salva. */
export async function setStoreOrigin(page: Page, producer: string, city?: string) {
  await page.goto("/meu-espaco/minha-loja");
  await page.getByLabel(/Nome do produtor ou engenho/).fill(producer);
  if (city) await page.getByLabel(/^Cidade/).fill(city);
  await page.getByRole("button", { name: "Salvar origem" }).click();
  await expect(page.getByText("Origem salva.")).toBeVisible();
}
