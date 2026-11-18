import "server-only";
import type { AdapterResult, IdentityAdapter, MessagingAdapter } from "./adapter";
import { identityResponseSchema, jsonSchemaFor, type AdaptationInput } from "./identity-contract";
import { IDENTITY_SYSTEM_PROMPT, identityUserPrompt } from "./identity-prompt";
import { InterpretOutput, TranslateOutput, type InterpretInput, type TranslateInput } from "./messaging-contract";
import { INTERPRET_SYSTEM_PROMPT, TRANSLATE_SYSTEM_PROMPT, interpretUserPrompt, translateUserPrompt } from "./messaging-prompt";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const TIMEOUT_MS = 45_000;

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
  promptFeedback?: { blockReason?: string };
};

/** Uma chamada generateContent com saída JSON estruturada. A chave nunca sai do servidor. */
async function generateJson(options: {
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  temperature: number;
  timeoutMs?: number;
}): Promise<AdapterResult> {
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${encodeURIComponent(options.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: options.system }] },
        contents: [{ role: "user", parts: [{ text: options.user }] }],
        generationConfig: {
          temperature: options.temperature,
          responseMimeType: "application/json",
          responseJsonSchema: options.schema,
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

/** Operação 1 pelo Gemini. */
export class GeminiIdentityAdapter implements IdentityAdapter {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  generateIdentity(input: AdaptationInput, attempt: number): Promise<AdapterResult> {
    return generateJson({
      apiKey: this.apiKey,
      model: this.model,
      system: IDENTITY_SYSTEM_PROMPT,
      user: identityUserPrompt(input),
      schema: identityResponseSchema(),
      // Uma segunda tentativa, após saída inválida, pede respostas mais conservadoras.
      temperature: attempt > 1 ? 0.4 : 0.8,
    });
  }
}

const interpretSchema = jsonSchemaFor(InterpretOutput);
const translateSchema = jsonSchemaFor(TranslateOutput);

/** Operações 2 e 3 pelo Gemini: temperatura baixa, fidelidade acima de estilo. */
export class GeminiMessagingAdapter implements MessagingAdapter {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  interpretInquiry(input: InterpretInput, attempt: number): Promise<AdapterResult> {
    return generateJson({
      apiKey: this.apiKey,
      model: this.model,
      system: INTERPRET_SYSTEM_PROMPT,
      user: interpretUserPrompt(input),
      schema: interpretSchema,
      temperature: attempt > 1 ? 0.1 : 0.3,
      timeoutMs: 25_000,
    });
  }

  translateReply(input: TranslateInput, attempt: number): Promise<AdapterResult> {
    return generateJson({
      apiKey: this.apiKey,
      model: this.model,
      system: TRANSLATE_SYSTEM_PROMPT,
      user: translateUserPrompt(input),
      schema: translateSchema,
      temperature: attempt > 1 ? 0 : 0.2,
      timeoutMs: 25_000,
    });
  }
}
