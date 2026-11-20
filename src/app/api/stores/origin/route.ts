import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { updateStoreOrigin } from "@/modules/products/repository";
import { StoreOrigin } from "@/modules/products/schema";
import { requireStoreIdForWrite } from "@/modules/stores/session";
import { mutation } from "../../products/handlers";

/** Grava produtor, cidade, estado e região da loja da sessão atual. */
export async function POST(request: Request) {
  return mutation(request, "store.origin", async () => {
    const body = StoreOrigin.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Confira os campos de origem.", body.error.issues);
    const storeId = await requireStoreIdForWrite();
    const origin = await updateStoreOrigin(storeId, body.data);
    return NextResponse.json({ origin });
  });
}
