import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getDeletionImpact } from "@/modules/products/repository";
import { requireExistingStoreId } from "@/modules/stores/session";
import { Uuid } from "../../handlers";

/** O que a exclusão apagaria agora (nome e conversas), para a confirmação. Só da loja da sessão. */
export async function GET(_request: Request, ctx: RouteContext<"/api/products/[productId]/deletion">) {
  const { productId } = await ctx.params;
  if (!Uuid.safeParse(productId).success) return apiError(404, "not_found", "Produto não encontrado.");
  const storeId = await requireExistingStoreId();
  if (!storeId) return apiError(404, "not_found", "Produto não encontrado nesta loja.");
  const impact = await getDeletionImpact(storeId, productId);
  if (!impact) return apiError(404, "not_found", "Produto não encontrado nesta loja.");
  return NextResponse.json({ impact }, { headers: { "cache-control": "no-store" } });
}
