import "server-only";
import { z } from "zod";
import { apiError, isSameOrigin } from "@/lib/http";
import { logEvent } from "@/lib/log";
import { PublicationError } from "@/modules/products/publication";
import { ProductError } from "@/modules/products/repository";
import { StoreError } from "@/modules/stores/catalog";

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
    if (error instanceof PublicationError) {
      switch (error.code) {
        case "missing_requirements":
          return apiError(422, "missing_requirements", "Preencha nome, descrição curta e pelo menos uma foto antes de gerar.");
        case "generation_in_progress":
          return apiError(409, "generation_in_progress", "Já existe uma geração em andamento para este produto.");
        case "adaptation_stale":
          return apiError(
            409,
            "adaptation_stale",
            "O cadastro mudou depois que estas opções foram geradas. Gere novas opções para publicar.",
          );
        case "adaptation_not_ready":
          return apiError(409, "adaptation_not_ready", "Estas opções não estão prontas para publicar. Gere novamente.");
        case "missing_producer":
          return apiError(422, "missing_producer", "Informe o nome do produtor ou engenho no cadastro antes de publicar.");
      }
    }
    if (error instanceof StoreError) {
      switch (error.code) {
        case "not_found":
          return apiError(404, "not_found", "Loja não encontrada neste navegador.");
        case "revision_conflict":
          return apiError(409, "revision_conflict", "A ordem foi alterada em outra aba ou janela. A lista foi atualizada.");
        case "order_mismatch":
          return apiError(409, "order_mismatch", "A lista de produtos mudou. Atualize a página e tente de novo.");
        case "intro_missing":
          return apiError(422, "intro_missing", "Estas opções não trazem apresentação da loja. Gere novamente para obtê-la.");
        case "adaptation_not_ready":
          return apiError(409, "adaptation_not_ready", "Estas opções não estão prontas. Gere novamente.");
      }
    }
    logEvent("api.error", { op: name, message: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return apiError(500, "server_error", "Erro inesperado no servidor. Seus dados no formulário foram mantidos.");
  }
}
