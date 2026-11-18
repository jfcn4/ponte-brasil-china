import "server-only";
import type { AdapterResult, IdentityAdapter } from "./adapter";
import { identityResponseSchema, type AdaptationInput } from "./identity-contract";
import { IDENTITY_SYSTEM_PROMPT, identityUserPrompt } from "./identity-prompt";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 45_000;

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
  promptFeedback?: { blockReason?: string };
};

/** Chamada à API do Gemini pelo servidor. A chave nunca sai daqui. */
export class GeminiIdentityAdapter implements IdentityAdapter {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async generateIdentity(input: AdaptationInput, attempt: number): Promise<AdapterResult> {
    let response: Response;
    try {
      response = await fetch(`${ENDPOINT}/${encodeURIComponent(this.model)}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: IDENTITY_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: identityUserPrompt(input) }] }],
          generationConfig: {
            // Uma segunda tentativa, após saída inválida, pede respostas mais conservadoras.
            temperature: attempt > 1 ? 0.4 : 0.8,
            responseMimeType: "application/json",
            responseJsonSchema: identityResponseSchema(),
          },
        }),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "unknown";
      if (name === "TimeoutError" || name === "AbortError") return { kind: "error", code: "timeout", detail: "timeout" };
      return { kind: "error", code: "provider_error", detail: `network:${name}` };
    }

    if (!response.ok) {
      const detail = response.status === 429 ? "http_429_quota" : `http_${response.status}`;
      return { kind: "error", code: "provider_error", detail };
    }

    const body = (await response.json().catch(() => null)) as GeminiResponse | null;
    const candidate = body?.candidates?.[0];
    if (!candidate) {
      return { kind: "error", code: "provider_error", detail: `no_candidate:${body?.promptFeedback?.blockReason ?? "?"}` };
    }
    const text = (candidate.content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    try {
      return { kind: "ok", raw: JSON.parse(text) };
    } catch {
      // JSON truncado ou malformado conta como saída inválida (o serviço decide repetir).
      return { kind: "ok", raw: { malformed: true, finishReason: candidate.finishReason ?? null } };
    }
  }
}
