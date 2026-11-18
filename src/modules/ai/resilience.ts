import type { AdapterResult } from "./adapter";

/**
 * Repetição do provedor de IA dentro de um prazo único.
 *
 * Em horários de pico o Gemini devolve 503 (modelo sobrecarregado) ou segura a
 * requisição muito além do normal. Uma única tentativa fazia a geração falhar
 * na frente da banca. Aqui:
 * - 5xx, 429, erro de rede e tempo esgotado passam ao próximo modelo do
 *   rodízio (principal e reservas, com capacidade separada), sem esperar;
 * - se uma chamada passa de `hedgeAfterMs` sem resposta, o próximo modelo é
 *   chamado em paralelo e vale a primeira resposta; as demais são canceladas;
 * - a cada volta completa do rodízio há uma pausa curta e crescente;
 * - 404 (modelo inexistente ou desativado) tira o modelo do rodízio;
 * - 400/401/403 e falta de configuração encerram sem novas chamadas;
 * - nenhuma chamada começa sem tempo útil antes do prazo (60 s na Vercel).
 * O resultado informa o modelo que respondeu e a trilha das falhas, sem
 * conteúdo do produtor ou do comprador.
 */

export type ModelCall = (model: string, timeoutMs: number, signal: AbortSignal) => Promise<AdapterResult>;

export type ResilienceOptions = {
  models: readonly string[];
  deadline: number;
  perCallMs: number;
  /** Sem resposta após este tempo, chama o próximo modelo em paralelo. */
  hedgeAfterMs?: number;
  maxCalls?: number;
  /** Menor janela que ainda vale uma chamada. */
  minCallMs?: number;
  backoffMs?: number;
  now?: () => number;
};

type ErrorResult = Extract<AdapterResult, { kind: "error" }>;

const RETRYABLE_DETAIL = /^(http_5\d\d|http_429|network:)/;

function isRetryable(result: ErrorResult) {
  if (result.code === "timeout") return true;
  return result.code === "provider_error" && RETRYABLE_DETAIL.test(result.detail);
}

export function callWithFallback(call: ModelCall, options: ResilienceOptions): Promise<AdapterResult> {
  const now = options.now ?? Date.now;
  const maxCalls = options.maxCalls ?? 6;
  const minCallMs = options.minCallMs ?? 4_000;
  const backoffMs = options.backoffMs ?? 1_000;
  const hedgeAfterMs = options.hedgeAfterMs ?? Number.POSITIVE_INFINITY;
  const rotation = [...new Set(options.models.filter(Boolean))];
  const controller = new AbortController();
  const trail: string[] = [];
  let last: ErrorResult = { kind: "error", code: "timeout", detail: "no_time" };

  return new Promise<AdapterResult>((resolve) => {
    let launched = 0;
    let inFlight = 0;
    let next = 0;
    let cycles = 0;
    let stopped = false;
    let settled = false;
    let hedge: ReturnType<typeof setTimeout> | undefined;
    let pause: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: AdapterResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(hedge);
      clearTimeout(pause);
      controller.abort();
      resolve(result);
    };
    const giveUp = () => {
      if (inFlight === 0) finish({ ...last, detail: trail.join(" > ").slice(0, 280) || last.detail });
    };

    const launch = () => {
      if (settled) return;
      clearTimeout(hedge);
      const remaining = options.deadline - now();
      if (stopped || launched >= maxCalls || rotation.length === 0 || remaining < minCallMs) {
        if (launched === 0) trail.push("no_time");
        giveUp();
        return;
      }
      const model = rotation[next % rotation.length]!;
      next = (next % rotation.length) + 1;
      launched += 1;
      inFlight += 1;
      if (Number.isFinite(hedgeAfterMs)) hedge = setTimeout(launch, hedgeAfterMs);

      call(model, Math.min(options.perCallMs, remaining), controller.signal)
        .catch((): AdapterResult => ({ kind: "error", code: "provider_error", detail: "network:crash" }))
        .then((result) => {
          inFlight -= 1;
          if (settled) return;
          if (result.kind === "ok") {
            finish({ ...result, model, detail: trail.length ? [...trail, `${model}:ok`].join(" > ") : undefined });
            return;
          }
          trail.push(`${model}:${result.detail}`);
          last = { ...result, model };

          if (result.code === "provider_error" && result.detail === "http_404" && rotation.length > 1) {
            const at = rotation.indexOf(model);
            if (at >= 0) {
              rotation.splice(at, 1);
              if (at < next) next -= 1;
            }
            if (inFlight === 0) launch();
            return;
          }
          if (!isRetryable(result)) {
            stopped = true;
            giveUp();
            return;
          }
          // Outra chamada ainda em andamento: ela segue e o timer de reserva continua valendo.
          if (inFlight > 0) return;
          if (next % rotation.length === 0) {
            cycles += 1;
            const wait = Math.min(backoffMs * cycles, Math.max(0, options.deadline - now() - minCallMs));
            clearTimeout(hedge);
            pause = setTimeout(launch, wait);
            return;
          }
          launch();
        });
    };

    launch();
  });
}
