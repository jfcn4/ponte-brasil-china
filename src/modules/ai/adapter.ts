import type { AdaptationInput } from "./identity-contract";
import type { InterpretInput, TranslateInput } from "./messaging-contract";

/** Resultado bruto do provedor. A validação do contrato acontece no serviço. */
export type AdapterResult =
  | { kind: "ok"; raw: unknown; model?: string; detail?: string }
  | { kind: "error"; code: "provider_error" | "timeout" | "not_configured"; detail: string; model?: string };

/**
 * Prazo absoluto (epoch ms) da operação inteira. O adaptador real reparte esse
 * tempo entre repetições e o modelo reserva; o de teste o ignora.
 */
export type CallOptions = { deadline?: number };

/** Adaptador de servidor da operação 1. Gemini na demonstração; respostas fixas nos testes. */
export interface IdentityAdapter {
  readonly model: string;
  generateIdentity(input: AdaptationInput, attempt: number, options?: CallOptions): Promise<AdapterResult>;
}

/** Adaptador de servidor das operações 2 (interpretar) e 3 (traduzir). */
export interface MessagingAdapter {
  readonly model: string;
  interpretInquiry(input: InterpretInput, attempt: number, options?: CallOptions): Promise<AdapterResult>;
  translateReply(input: TranslateInput, attempt: number, options?: CallOptions): Promise<AdapterResult>;
}
