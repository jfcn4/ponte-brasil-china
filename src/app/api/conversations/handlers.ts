import "server-only";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { MessagingError } from "@/modules/messaging/service";

export const Uuid = z.uuid();

/** Mensagens de erro do módulo Messaging. Comprador em chinês; produtor em português. */
export function messagingErrorResponse(error: unknown, audience: "buyer" | "producer"): Response | null {
  if (!(error instanceof MessagingError)) return null;
  const zh = audience === "buyer";
  switch (error.code) {
    case "product_not_found":
      return apiError(404, "not_found", zh ? "未找到该产品。" : "Produto não encontrado.");
    case "product_unavailable":
      return apiError(410, "product_unavailable", zh ? "该产品已下架，暂时无法发起新的询价。" : "Produto retirado da vitrine.");
    case "version_changed":
      return apiError(
        409,
        "version_changed",
        zh ? "产品信息刚刚更新。请先查看最新内容，再发送询价。您的留言已保留。" : "A vitrine foi republicada.",
      );
    case "token_conflict":
      return apiError(409, "token_conflict", zh ? "请刷新页面后重新发送。" : "Conflito de envio.");
    case "conversation_not_found":
      return apiError(404, "not_found", zh ? "未找到该对话，请确认私密链接是否完整。" : "Conversa não encontrada nesta loja.");
    case "conversation_full":
      return apiError(409, "conversation_full", zh ? "该对话消息已达上限。" : "Conversa com mensagens demais.");
    case "message_not_found":
      return apiError(404, "not_found", "Mensagem não encontrada nesta conversa.");
    case "draft_not_found":
      return apiError(404, "not_found", "Rascunho de resposta não encontrado.");
    case "revision_conflict":
      return apiError(409, "revision_conflict", "A resposta foi alterada ou enviada em outra aba. Recarregue a conversa.");
    case "translation_stale":
      return apiError(
        409,
        "translation_stale",
        "O texto mudou depois da última revisão de tradução. Revise a tradução novamente antes de enviar.",
      );
  }
}

/** Envolve uma rota do módulo: origem, erros conhecidos e log sem conteúdo das mensagens. */
export async function messagingRoute(
  request: Request,
  name: string,
  audience: "buyer" | "producer",
  run: () => Promise<Response>,
  options: { mutation: boolean } = { mutation: true },
): Promise<Response> {
  if (options.mutation && !isSameOrigin(request)) {
    return apiError(403, "forbidden_origin", audience === "buyer" ? "请求被拒绝。" : "Requisição de outra origem recusada.");
  }
  try {
    return await run();
  } catch (error) {
    const known = messagingErrorResponse(error, audience);
    if (known) return known;
    logEvent("api.error", { op: name, message: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return apiError(
      500,
      "server_error",
      audience === "buyer" ? "服务器暂时出错。您的留言已保留，请稍后重试。" : "Erro inesperado no servidor. Seu texto foi mantido.",
    );
  }
}
