import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { MAX_UPLOAD_BYTES, addImage, sniffImageType } from "@/modules/products/repository";
import { requireExistingStoreId } from "@/modules/stores/session";
import { Uuid, mutation } from "../../handlers";

function dimension(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 && n <= 20000 ? n : null;
}

/** Recebe uma foto (já reduzida no navegador) e a registra na próxima posição. */
export async function POST(request: Request, ctx: RouteContext<"/api/products/[productId]/images">) {
  return mutation(request, "product.image_add", async () => {
    const { productId } = await ctx.params;
    if (!Uuid.safeParse(productId).success) return apiError(404, "not_found", "Produto não encontrado.");

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) {
      return apiError(413, "image_too_large", "A foto passou de 4 MB. Tente uma imagem menor.");
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof Blob)) return apiError(400, "invalid_request", "Envie um arquivo de imagem.");
    if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
      return apiError(413, "image_too_large", "A foto passou de 4 MB. Tente uma imagem menor.");
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = sniffImageType(bytes);
    if (!contentType) return apiError(415, "unsupported_image", "Formato não aceito. Envie JPG, PNG ou WebP.");

    const storeId = await requireExistingStoreId();
    if (!storeId) return apiError(404, "not_found", "Produto não encontrado nesta loja.");
    const images = await addImage(storeId, productId, {
      bytes,
      contentType,
      width: dimension(form.get("width")),
      height: dimension(form.get("height")),
    });
    return NextResponse.json({ images }, { status: 201 });
  });
}
