import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { saveDraft } from "@/modules/products/repository";
import { SaveDraftRequest } from "@/modules/products/schema";
import { requireStoreIdForWrite } from "@/modules/stores/session";
import { mutation } from "./handlers";

/** Cria um rascunho na loja deste navegador (a loja nasce na primeira gravação). */
export async function POST(request: Request) {
  return mutation(request, "product.create", async () => {
    const body = SaveDraftRequest.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Dados do cadastro inválidos.", body.error.issues);
    const storeId = await requireStoreIdForWrite();
    const product = await saveDraft(storeId, null, body.data);
    return NextResponse.json({ product }, { status: 201 });
  });
}
