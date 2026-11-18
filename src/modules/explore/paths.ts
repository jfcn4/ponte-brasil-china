/**
 * Caminhos do diretório fictício, separados de /l e /p (vitrines reais).
 * Sem dependências: usável no servidor e no navegador.
 */
export const EXPLORE_PATH = "/zh/explorar";
export const EXPLORE_ORIGIN_PARAM = "de";

export function demoStorePath(store: string) {
  return `${EXPLORE_PATH}/${store}`;
}

export function demoProductPath(store: string, product: string) {
  return `${EXPLORE_PATH}/${store}/${product}`;
}

/**
 * Retorno à vitrine real de onde o comprador saiu. Só aceita os caminhos
 * públicos reais (/l/<código> e /p/<código>), nunca um endereço externo.
 */
export function safeOriginPath(value: string | null | undefined): string | null {
  return value && /^\/[lp]\/[a-z0-9]{10}$/.test(value) ? value : null;
}

/** Link "Explorar" levando, quando válida, a vitrine real atual para o retorno. */
export function exploreHref(from?: string): string {
  const origin = safeOriginPath(from);
  return origin ? `${EXPLORE_PATH}?${EXPLORE_ORIGIN_PARAM}=${encodeURIComponent(origin)}` : EXPLORE_PATH;
}
