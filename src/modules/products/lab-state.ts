import type { IdentityOutput } from "@/modules/ai/identity-contract";
import type { Choice } from "./presentation";
import type { DisplayStatus, ProductDraft, ProductImageView, StoreOrigin } from "./schema";

/** Estado do laboratório e da revisão, montado no servidor para a loja da sessão. */
export type LabState = {
  product: {
    id: string;
    name: string | null;
    revision: number;
    mediaRevision: number;
    status: DisplayStatus;
  };
  draft: ProductDraft;
  store: StoreOrigin;
  images: ProductImageView[];
  generationMissing: Array<"name" | "short_description" | "image">;
  publicationMissing: Array<"producer_name" | "image">;
  /** Última tentativa de geração, qualquer que seja o resultado. */
  latest: {
    id: string;
    status: "generating" | "ready" | "failed";
    errorCode: string | null;
    createdAt: string;
    /** A entrada ainda corresponde ao cadastro atual. */
    isCurrent: boolean;
  } | null;
  /** Adaptação pronta cuja entrada corresponde ao cadastro atual (pode ser publicada). */
  usable: {
    id: string;
    model: string | null;
    isTestAdapter: boolean;
    createdAt: string;
    output: IdentityOutput;
  } | null;
  /** Há opções prontas, mas geradas a partir de dados que mudaram depois. */
  hasStaleReady: boolean;
  published: {
    version: number;
    choice: Choice;
    adaptationId: string;
    title: string;
    publishedAt: string;
    /** Rascunho difere da versão no ar (textos, fotos ou origem). */
    pending: boolean;
    url: string;
    qrSvg: string;
    qrPngDataUrl: string;
  } | null;
};

export const GENERATION_ERROR_MESSAGES: Record<string, string> = {
  invalid_output:
    "A IA devolveu uma resposta fora do formato combinado (por exemplo, nomes repetidos ou destaque sem fonte). Nada foi aplicado.",
  provider_error: "O serviço de IA não respondeu como esperado. Pode ser instabilidade ou limite de uso.",
  timeout: "O serviço de IA demorou demais para responder.",
  not_configured: "A IA não está configurada neste ambiente (falta a chave do Gemini no servidor).",
  abandoned: "A geração anterior foi interrompida antes de terminar.",
};
