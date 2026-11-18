/** Resultado de uma chamada à própria API, com o erro já lido do corpo. */
export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string | null; message: string; data: Partial<T> | null }
  | { ok: false; status: 0; code: "network"; message: string; data: null };

export async function fetchJson<T>(
  url: string,
  init: RequestInit & { json?: unknown } = {},
  networkMessage = "Sem conexão com o servidor.",
): Promise<ApiResult<T>> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      ...rest,
      headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    return { ok: false, status: 0, code: "network", message: networkMessage, data: null };
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: { code?: string; message?: string } }) | null;
  if (response.ok && body) return { ok: true, status: response.status, data: body };
  return {
    ok: false,
    status: response.status,
    code: body?.error?.code ?? null,
    message: body?.error?.message ?? `Falha ao comunicar com o servidor (${response.status}).`,
    data: body,
  };
}

/** Lê e grava no armazenamento do navegador sem quebrar em janelas privadas. */
export const safeStorage = {
  get<T>(kind: "local" | "session", key: string): T | null {
    try {
      const raw = (kind === "local" ? localStorage : sessionStorage).getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(kind: "local" | "session", key: string, value: unknown) {
    try {
      (kind === "local" ? localStorage : sessionStorage).setItem(key, JSON.stringify(value));
    } catch {
      /* armazenamento indisponível: segue sem a conveniência */
    }
  },
  remove(kind: "local" | "session", key: string) {
    try {
      (kind === "local" ? localStorage : sessionStorage).removeItem(key);
    } catch {
      /* idem */
    }
  },
};
