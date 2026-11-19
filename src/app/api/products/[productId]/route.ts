import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { z } from "zod";
import { deleteProduct, listProducts, saveDraft } from "@/modules/products/repository";
import { SaveDraftRequest } from "@/modules/products/schema";
import { getCatalogRevision } from "@/modules/stores/catalog";
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

const DeleteBody = z.object({ expectedConversations: z.number().int().min(0).nullable() }).strict();

/**
 * Exclusão definitiva: produto, versões, conversas e mensagens numa transação.
 * `expectedConversations` é o número mostrado na confirmação; se mudou, nada é apagado.
 * Devolve a lista atualizada para o painel (o destaque segue a ordem salva).
 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/products/[productId]">) {
  return mutation(request, "product.delete", async () => {
    const { productId } = await ctx.params;
    if (!Uuid.safeParse(productId).success) return apiError(404, "not_found", "Produto não encontrado.");
    const body = DeleteBody.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Pedido de exclusão inválido.", body.error.issues);
    const storeId = await requireExistingStoreId();
    if (!storeId) return apiError(404, "not_found", "Produto não encontrado nesta loja.");

    const deleted = await deleteProduct(storeId, productId, body.data.expectedConversations);
    const [catalogRevision, products] = await Promise.all([getCatalogRevision(storeId), listProducts(storeId)]);
    return NextResponse.json({ deleted, catalogRevision, products });
  });
}
