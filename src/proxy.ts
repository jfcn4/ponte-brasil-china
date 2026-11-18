import { NextResponse, type NextRequest } from "next/server";
import {
  STORE_SESSION_COOKIE,
  generateSessionToken,
  isWellFormedSessionToken,
  sessionCookieOptions,
} from "@/modules/stores/token";

/**
 * Emite o cookie da sessão anônima ao entrar em "Meu espaço", antes de qualquer
 * gravação. Assim, envios simultâneos (texto e foto) chegam com o mesmo segredo
 * e resolvem a mesma loja. Nenhuma linha é criada no banco aqui.
 */
export function proxy(request: NextRequest) {
  if (isWellFormedSessionToken(request.cookies.get(STORE_SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  const token = generateSessionToken();
  request.cookies.set(STORE_SESSION_COOKIE, token);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(STORE_SESSION_COOKIE, token, sessionCookieOptions());
  return response;
}

export const config = {
  matcher: ["/meu-espaco/:path*", "/api/products/:path*"],
};
