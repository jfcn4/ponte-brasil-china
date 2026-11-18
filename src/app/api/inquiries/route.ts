import { after, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { StartInquiryRequest } from "@/modules/messaging/schema";
import { interpretMessage, startConversation } from "@/modules/messaging/service";
import { messagingRoute } from "../conversations/handlers";

/** A interpretação (Gemini) roda depois da resposta ao comprador. */
export const maxDuration = 60;

/**
 * “询价 · Solicitar cotação”: inicia a conversa a partir da vitrine, sem conta.
 * O navegador do comprador gera o segredo do link privado; o servidor guarda
 * só o hash. Repetir o mesmo envio devolve a mesma conversa.
 */
export async function POST(request: Request) {
  return messagingRoute(request, "inquiry.start", "buyer", async () => {
    const body = StartInquiryRequest.safeParse(await request.json().catch(() => null));
    if (!body.success) return apiError(400, "invalid_request", "请填写留言内容（最多 2000 字）。", body.error.issues);
    const started = await startConversation(body.data);
    if (started.created) after(() => interpretMessage(started.storeId, started.messageId).then(() => undefined));
    return NextResponse.json({ ok: true }, { status: started.created ? 201 : 200, headers: { "cache-control": "no-store" } });
  });
}
