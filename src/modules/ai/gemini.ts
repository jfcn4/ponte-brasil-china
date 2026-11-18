import "server-only";
import type { AdapterResult, CallOptions, IdentityAdapter, MessagingAdapter } from "./adapter";
import { identityResponseSchema, jsonSchemaFor, type AdaptationInput } from "./identity-contract";
import { IDENTITY_SYSTEM_PROMPT, identityUserPrompt } from "./identity-prompt";
import { InterpretOutput, TranslateOutput, type InterpretInput, type TranslateInput } from "./messaging-contract";
import { INTERPRET_SYSTEM_PROMPT, TRANSLATE_SYSTEM_PROMPT, interpretUserPrompt, translateUserPrompt } from "./messaging-prompt";
import { callWithFallback } from "./resilience";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/** Prazo padrão de uma operação, quando o serviço não informa outro (rotas têm 60 s). */
const DEFAULT_BUDGET_MS = 50_000;

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
  timeoutMs: number;
  signal: AbortSignal;
}): Promise<AdapterResult> {
  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${encodeURIComponent(options.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
      signal: AbortSignal.any([AbortSignal.timeout(options.timeoutMs), options.signal]),
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

type ModelPair = { model: string; fallbackModels: readonly string[] };

function resilient(
  models: ModelPair,
  options: CallOptions | undefined,
  timing: { perCallMs: number; hedgeAfterMs: number },
  request: (model: string, timeoutMs: number, signal: AbortSignal) => Promise<AdapterResult>,
) {
  return callWithFallback(request, {
    models: [models.model, ...models.fallbackModels],
    deadline: options?.deadline ?? Date.now() + DEFAULT_BUDGET_MS,
    ...timing,
  });
}

/** Respostas típicas: identidade 4–10 s, mensagens 1–8 s. Acima disso, o próximo modelo entra em paralelo. */
const IDENTITY_TIMING = { perCallMs: 30_000, hedgeAfterMs: 14_000 };
const MESSAGING_TIMING = { perCallMs: 20_000, hedgeAfterMs: 10_000 };

/** Operação 1 pelo Gemini. */
export class GeminiIdentityAdapter implements IdentityAdapter {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    readonly fallbackModels: readonly string[] = [],
  ) {}

  generateIdentity(input: AdaptationInput, attempt: number, options?: CallOptions): Promise<AdapterResult> {
    return resilient(this, options, IDENTITY_TIMING, (model, timeoutMs, signal) =>
      generateJson({
        apiKey: this.apiKey,
        model,
        system: IDENTITY_SYSTEM_PROMPT,
        user: identityUserPrompt(input),
        schema: identityResponseSchema(),
        // Uma segunda tentativa, após saída inválida, pede respostas mais conservadoras.
        temperature: attempt > 1 ? 0.4 : 0.8,
        timeoutMs,
        signal,
      }),
    );
  }
}

const interpretSchema = jsonSchemaFor(InterpretOutput);
const translateSchema = jsonSchemaFor(TranslateOutput);

/** Operações 2 e 3 pelo Gemini: temperatura baixa, fidelidade acima de estilo. */
export class GeminiMessagingAdapter implements MessagingAdapter {
  constructor(
    private readonly apiKey: string,
    readonly model: string,
    readonly fallbackModels: readonly string[] = [],
  ) {}

  interpretInquiry(input: InterpretInput, attempt: number, options?: CallOptions): Promise<AdapterResult> {
    return resilient(this, options, MESSAGING_TIMING, (model, timeoutMs, signal) =>
      generateJson({
        apiKey: this.apiKey,
        model,
        system: INTERPRET_SYSTEM_PROMPT,
        user: interpretUserPrompt(input),
        schema: interpretSchema,
        temperature: attempt > 1 ? 0.1 : 0.3,
        timeoutMs,
        signal,
      }),
    );
  }

  translateReply(input: TranslateInput, attempt: number, options?: CallOptions): Promise<AdapterResult> {
    return resilient(this, options, MESSAGING_TIMING, (model, timeoutMs, signal) =>
      generateJson({
        apiKey: this.apiKey,
        model,
        system: TRANSLATE_SYSTEM_PROMPT,
        user: translateUserPrompt(input),
        schema: translateSchema,
        temperature: attempt > 1 ? 0 : 0.2,
        timeoutMs,
        signal,
      }),
    );
  }
}
