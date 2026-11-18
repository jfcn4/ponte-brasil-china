/**
 * Repetição do provedor de IA: o Gemini responde 503 ou demora demais em
 * horários de pico. A camada passa ao modelo reserva, chama-o em paralelo
 * quando o principal demora e respeita o prazo da rota (60 s na Vercel).
 * Sem chamadas reais; relógio simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdapterResult } from "@/modules/ai/adapter";
import { callWithFallback } from "@/modules/ai/resilience";

const ok = (raw: unknown = { fine: true }): AdapterResult => ({ kind: "ok", raw });
const http = (status: number): AdapterResult => ({ kind: "error", code: "provider_error", detail: `http_${status}` });

/** "hang": só termina pelo tempo limite da chamada (como o fetch real) ou ao ser cancelada. */
type Step = AdapterResult | { after: number; result: AdapterResult } | "hang";

function scripted(responses: Record<string, Step[]>) {
  const calls: Array<{ model: string; timeoutMs: number; at: number; aborted: () => boolean }> = [];
  const call = (model: string, timeoutMs: number, signal: AbortSignal) => {
    calls.push({ model, timeoutMs, at: Date.now(), aborted: () => signal.aborted });
    const step = responses[model]?.shift() ?? http(503);
    return new Promise<AdapterResult>((resolve) => {
      const timeout = () => resolve({ kind: "error", code: "timeout", detail: "timeout" });
      signal.addEventListener("abort", timeout);
      if (step === "hang") setTimeout(timeout, timeoutMs);
      else if ("after" in step) setTimeout(() => resolve(step.result), step.after);
      else setTimeout(() => resolve(step), 500);
    });
  };
  return { call, calls };
}

async function run(promise: Promise<AdapterResult>) {
  await vi.runAllTimersAsync();
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => vi.useRealTimers());

const base = { deadline: 50_000, perCallMs: 30_000, hedgeAfterMs: 14_000 };

describe("callWithFallback", () => {
  it("primeira resposta válida passa direto, sem trilha", async () => {
    const s = scripted({ a: [ok()] });
    const result = await run(callWithFallback(s.call, { ...base, models: ["a", "b"] }));
    expect(result).toMatchObject({ kind: "ok", model: "a" });
    expect(result.kind === "ok" && result.detail).toBeUndefined();
    expect(s.calls.map((c) => c.model)).toEqual(["a"]);
  });

  it("503 no principal passa na hora ao reserva e registra a trilha", async () => {
    const s = scripted({ a: [http(503)], b: [ok()] });
    const result = await run(callWithFallback(s.call, { ...base, models: ["a", "b"] }));
    expect(result).toMatchObject({ kind: "ok", model: "b", detail: "a:http_503 > b:ok" });
    expect(s.calls.map((c) => c.model)).toEqual(["a", "b"]);
  });

  it("principal sem resposta: o reserva entra em paralelo e o principal é cancelado", async () => {
    const s = scripted({ a: ["hang"], b: [{ after: 3_000, result: ok() }] });
    const result = await run(callWithFallback(s.call, { ...base, models: ["a", "b"] }));
    expect(result).toMatchObject({ kind: "ok", model: "b" });
    expect(s.calls.map((c) => [c.model, c.at])).toEqual([
      ["a", 0],
      ["b", 14_000],
    ]);
    expect(s.calls[0]!.aborted()).toBe(true);
  });

  it("com um só modelo, repete após pausa curta", async () => {
    const s = scripted({ a: [http(503), { kind: "error", code: "timeout", detail: "timeout" }, ok()] });
    const result = await run(callWithFallback(s.call, { ...base, models: ["a"] }));
    expect(result).toMatchObject({ kind: "ok", model: "a" });
    expect(s.calls).toHaveLength(3);
    expect(s.calls[1]!.at).toBeGreaterThanOrEqual(1_500); // 500 ms de resposta + 1 s de pausa
  });

  it("429 e erro de rede também passam ao próximo modelo", async () => {
    const s = scripted({ a: [http(429), ok()], b: [{ kind: "error", code: "provider_error", detail: "network:TypeError" }] });
    const result = await run(callWithFallback(s.call, { ...base, models: ["a", "b"] }));
    expect(result).toMatchObject({ kind: "ok", model: "a" });
    expect(s.calls.map((c) => c.model)).toEqual(["a", "b", "a"]);
  });

  it("404 tira o modelo do rodízio (GEMINI_MODEL desativado ainda funciona pelo reserva)", async () => {
    const s = scripted({ a: [http(404)], b: [http(503), ok()] });
    const result = await run(callWithFallback(s.call, { ...base, models: ["a", "b"] }));
    expect(result).toMatchObject({ kind: "ok", model: "b" });
    expect(s.calls.map((c) => c.model)).toEqual(["a", "b", "b"]);
  });

  it("400 ou 403 encerram sem repetir", async () => {
    for (const status of [400, 403]) {
      const s = scripted({ a: [http(status)], b: [ok()] });
      const result = await run(callWithFallback(s.call, { ...base, models: ["a", "b"] }));
      expect(result).toMatchObject({ kind: "error", code: "provider_error", detail: `a:http_${status}` });
      expect(s.calls).toHaveLength(1);
    }
  });

  it("todos sobrecarregados: erro com a trilha, no limite de chamadas", async () => {
    const s = scripted({});
    const result = await run(callWithFallback(s.call, { ...base, maxCalls: 5, models: ["a", "b", "c"] }));
    expect(result).toMatchObject({ kind: "error", code: "provider_error" });
    expect(result.kind === "error" && result.detail).toBe("a:http_503 > b:http_503 > c:http_503 > a:http_503 > b:http_503");
    expect(s.calls).toHaveLength(5);
  });

  it("todos pendurados: tempo esgotado antes do prazo da rota", async () => {
    const s = scripted({ a: ["hang", "hang"], b: ["hang", "hang"] });
    const promise = callWithFallback(s.call, { ...base, models: ["a", "b"] });
    let doneAt = -1;
    void promise.then(() => (doneAt = Date.now()));
    const result = await run(promise);
    expect(result).toMatchObject({ kind: "error", code: "timeout" });
    expect(doneAt).toBeLessThanOrEqual(base.deadline);
    expect(s.calls.every((c) => c.at + c.timeoutMs <= base.deadline)).toBe(true);
  });

  it("não começa chamada sem tempo útil e encurta o limite ao prazo", async () => {
    const s = scripted({ a: [{ after: 20_000, result: http(503) }], b: [ok()] });
    const result = await run(callWithFallback(s.call, { ...base, hedgeAfterMs: Infinity, deadline: 30_000, models: ["a", "b"] }));
    expect(result).toMatchObject({ kind: "ok", model: "b" });
    expect(s.calls[1]!.timeoutMs).toBe(10_000);

    vi.setSystemTime(48_000);
    const late = scripted({ a: [ok()] });
    const none = await run(callWithFallback(late.call, { ...base, models: ["a"] }));
    expect(none).toMatchObject({ kind: "error", code: "timeout", detail: "no_time" });
    expect(late.calls).toHaveLength(0);
  });
});
