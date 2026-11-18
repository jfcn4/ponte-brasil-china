import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { saveDraft } from "@/modules/products/repository";
import { SaveDraftRequest } from "@/modules/products/schema";
import { requireExistingStoreId } from "@/modules/stores/session";
import { Uuid, mutation } from "../handlers";

/** Atualiza o rascunho com comparação de revisão. */
export async function PUT(request: Request, ctx: RouteContext<"/api/products/[productId]">) {
  return mutation(request, "product.update", async () => {
    const { productId } = await ctx.params;
    if (!Uuid.safeParse(productId).success) return apiError(404, "not_found", "Produto não encontrado.");
    const body = SaveDraftRequest.safeParse(await request.json().catch(() => null));
    if (!body.success || body.data.expectedRevision === null) {
      return apiError(400, "invalid_request", "Dados do cadastro inválidos.", body.error?.issues);
    }
    const storeId = await requireExistingStoreId();
    if (!storeId) return apiError(404, "not_found", "Produto não encontrado nesta loja.");
    const product = await saveDraft(storeId, productId, body.data);
    return NextResponse.json({ product });
  });
}
