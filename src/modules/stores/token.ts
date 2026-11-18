/**
 * Segredo da sessão anônima do produtor. O cookie guarda o token; o banco
 * guarda apenas o SHA-256 em hexadecimal. Usa Web Crypto para funcionar tanto
 * no proxy quanto nas rotas do servidor.
 */
export const STORE_SESSION_COOKIE = "pg_store_session";
export const STORE_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 400; // limite aceito pelos navegadores

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isWellFormedSessionToken(token: string | undefined | null): token is string {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STORE_SESSION_MAX_AGE_SECONDS,
  };
}
