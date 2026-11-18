import "server-only";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { ProductError } from "@/modules/products/repository";

export const Uuid = z.uuid();

/** Envolve uma mutação: origem, erros conhecidos e log sem conteúdo do produtor. */
export async function mutation(request: Request, name: string, run: () => Promise<Response>): Promise<Response> {
  if (!isSameOrigin(request)) {
    return apiError(403, "forbidden_origin", "Requisição de outra origem recusada.");
  }
  try {
    return await run();
  } catch (error) {
    if (error instanceof ProductError) {
      switch (error.code) {
        case "not_found":
          return apiError(404, "not_found", "Produto ou foto não encontrado nesta loja.");
        case "revision_conflict":
          return apiError(409, "revision_conflict", "Este rascunho foi alterado em outra aba ou janela.");
        case "image_limit_reached":
          return apiError(409, "image_limit_reached", "Cada produto aceita até três fotos.");
        case "storage_failed":
          return apiError(502, "storage_failed", "Não foi possível guardar a foto. Tente novamente.");
      }
    }
    logEvent("api.error", { op: name, message: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return apiError(500, "server_error", "Erro inesperado no servidor. Seus dados no formulário foram mantidos.");
  }
}
