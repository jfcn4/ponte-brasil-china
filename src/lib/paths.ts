/** Caminhos públicos (sem origem). Usáveis no servidor e no navegador. */

/** Vitrine individual do produto (QR do produto). Estável desde a primeira publicação. */
export function productPath(slug: string) {
  return `/p/${slug}`;
}

/** Catálogo público da loja (QR da loja). Estável desde a primeira publicação. */
export function storePath(slug: string) {
  return `/l/${slug}`;
}
