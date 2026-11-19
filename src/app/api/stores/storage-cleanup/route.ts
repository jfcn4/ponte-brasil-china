import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { runStorageCleanup } from "@/modules/products/repository";
import { requireExistingStoreId } from "@/modules/stores/session";
import { mutation } from "../../products/handlers";

/** Repete a remoção das fotos de produtos excluídos que o Storage não aceitou antes. */
export async function POST(request: Request) {
  return mutation(request, "store.storage_cleanup", async () => {
    const storeId = await requireExistingStoreId();
    if (!storeId) return apiError(404, "not_found", "Loja não encontrada neste navegador.");
    const pendingCleanup = await runStorageCleanup(storeId);
    return NextResponse.json({ pendingCleanup });
  });
}
