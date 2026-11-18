import type { AdaptationInput } from "./identity-contract";

/** Resultado bruto do provedor. A validação do contrato acontece no serviço. */
export type AdapterResult =
  | { kind: "ok"; raw: unknown }
  | { kind: "error"; code: "provider_error" | "timeout" | "not_configured"; detail: string };

/** Adaptador de servidor da operação 1. Gemini na demonstração; respostas fixas nos testes. */
export interface IdentityAdapter {
  readonly model: string;
  generateIdentity(input: AdaptationInput, attempt: number): Promise<AdapterResult>;
}
