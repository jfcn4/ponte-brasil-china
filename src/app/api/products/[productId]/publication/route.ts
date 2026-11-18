import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/http";
import { CHOICES } from "@/modules/products/presentation";
import { getLabState, publishProduct } from "@/modules/products/publication";
import { requireExistingStoreId } from "@/modules/stores/session";
import { Uuid, mutation } from "../../handlers";

const Body = z
  .object({
    adaptationId: z.uuid(),
    choice: z.enum(CHOICES),
    expectedRevision: z.number().int().positive(),
    expectedMediaRevision: z.number().int().positive(),
    approveStoreIntro: z.boolean().optional(),
    confirmed: z.literal(true),
  })
  .strict();

/**
 * Publica a versão revisada, só com confirmação explícita. Repetir o mesmo
 * pedido devolve a versão já no ar, sem criar outra.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/products/[productId]/publication">) {
  return mutation(request, "product.publish", async () => {
    const { productId } = await ctx.params;
    if (!Uuid.safeParse(productId).success) return apiError(404, "not_found", "Produto não encontrado.");
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Pedido de publicação inválido.", body.error.issues);
    const storeId = await requireExistingStoreId();
    if (!storeId) return apiError(404, "not_found", "Produto não encontrado nesta loja.");

    const published = await publishProduct(storeId, productId, body.data);
    const lab = await getLabState(storeId, productId);
    return NextResponse.json({ published, lab }, { status: published.created ? 201 : 200 });
  });
}

/** Estado atual do laboratório (para atualizar a revisão depois de editar em outra aba). */
export async function GET(_request: Request, ctx: RouteContext<"/api/products/[productId]/publication">) {
  const { productId } = await ctx.params;
  if (!Uuid.safeParse(productId).success) return apiError(404, "not_found", "Produto não encontrado.");
  const storeId = await requireExistingStoreId();
  const lab = storeId ? await getLabState(storeId, productId) : null;
  if (!lab) return apiError(404, "not_found", "Produto não encontrado nesta loja.");
  return NextResponse.json({ lab }, { headers: { "cache-control": "no-store" } });
}
