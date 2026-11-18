import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { setPrimaryImage } from "@/modules/products/repository";
import { requireExistingStoreId } from "@/modules/stores/session";
import { Uuid, mutation } from "../../../../handlers";

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/products/[productId]/images/[imageId]/primary">,
) {
  return mutation(request, "product.image_primary", async () => {
    const { productId, imageId } = await ctx.params;
    if (!Uuid.safeParse(productId).success || !Uuid.safeParse(imageId).success) {
      return apiError(404, "not_found", "Foto não encontrada.");
    }
    const storeId = await requireExistingStoreId();
    if (!storeId) return apiError(404, "not_found", "Produto não encontrado nesta loja.");
    return NextResponse.json({ images: await setPrimaryImage(storeId, productId, imageId) });
  });
}
