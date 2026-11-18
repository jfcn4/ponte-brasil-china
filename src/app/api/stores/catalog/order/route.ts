import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/http";
import { listProducts } from "@/modules/products/repository";
import { getCatalogRevision, reorderProducts } from "@/modules/stores/catalog";
import { requireExistingStoreId } from "@/modules/stores/session";
import { mutation } from "../../../products/handlers";

const Body = z
  .object({
    productIds: z.array(z.uuid()).min(1).max(200),
    expectedRevision: z.number().int().positive(),
  })
  .strict();

/**
 * Grava a ordem dos produtos da loja (todos, rascunhos inclusive). Devolve a
 * lista atualizada; em conflito, a lista atual para o painel se realinhar.
 */
export async function PUT(request: Request) {
  return mutation(request, "store.reorder", async () => {
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Pedido de ordenação inválido.", body.error.issues);
    const storeId = await requireExistingStoreId();
    if (!storeId) return apiError(404, "not_found", "Loja não encontrada neste navegador.");

    const { catalogRevision } = await reorderProducts(storeId, body.data.productIds, body.data.expectedRevision);
    return NextResponse.json({ catalogRevision, products: await listProducts(storeId) });
  });
}

/** Ordem atual (para realinhar o painel depois de um conflito). */
export async function GET() {
  const storeId = await requireExistingStoreId();
  if (!storeId) return apiError(404, "not_found", "Loja não encontrada neste navegador.");
  const [catalogRevision, products] = await Promise.all([getCatalogRevision(storeId), listProducts(storeId)]);
  return NextResponse.json(
    { catalogRevision, products },
    { headers: { "cache-control": "no-store" } },
  );
}
