import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/http";
import { generateAdaptation, getLabState } from "@/modules/products/publication";
import { requireExistingStoreId } from "@/modules/stores/session";
import { Uuid, mutation } from "../../handlers";

/** A geração com o Gemini pode levar dezenas de segundos. */
export const maxDuration = 60;

const Body = z.object({ expectedRevision: z.number().int().positive() }).strict();

/**
 * Gera nomes e conteúdo chinês a partir do rascunho salvo na revisão
 * informada. Responde com o estado atualizado do laboratório, inclusive em
 * falha da IA (o rascunho continua intacto e a geração pode ser repetida).
 */
export async function POST(request: Request, ctx: RouteContext<"/api/products/[productId]/adaptations">) {
  return mutation(request, "adaptation.generate", async () => {
    const { productId } = await ctx.params;
    if (!Uuid.safeParse(productId).success) return apiError(404, "not_found", "Produto não encontrado.");
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "Pedido de geração inválido.", body.error.issues);
    const storeId = await requireExistingStoreId();
    if (!storeId) return apiError(404, "not_found", "Produto não encontrado nesta loja.");

    const result = await generateAdaptation(storeId, productId, body.data.expectedRevision);
    const lab = await getLabState(storeId, productId);
    return NextResponse.json({ result, lab }, { status: result.status === "ready" ? 201 : 502 });
  });
}
