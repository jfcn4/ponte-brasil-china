/**
 * Escolha da origem pública dos links e QRs, sem dependências de servidor
 * (testável). Ordem: APP_URL; domínio de produção da Vercel; host da requisição.
 * Na Vercel, um APP_URL local (copiado do .env.local) é ignorado: o celular do
 * comprador nunca alcança localhost.
 */
export function isLoopbackUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host.endsWith(".localhost") || /^127\./.test(host) || host === "[::1]" || host === "0.0.0.0";
  } catch {
    return true;
  }
}

export async function choosePublicOrigin(input: {
  appUrl: string | undefined;
  onVercel: boolean;
  productionHost: string | undefined;
  requestOrigin: () => Promise<string>;
}): Promise<{ origin: string; ignoredAppUrl: boolean }> {
  const ignoredAppUrl = Boolean(input.appUrl && input.onVercel && isLoopbackUrl(input.appUrl));
  if (input.appUrl && !ignoredAppUrl) return { origin: input.appUrl.replace(/\/+$/, ""), ignoredAppUrl };
  if (input.productionHost) return { origin: `https://${input.productionHost}`, ignoredAppUrl };
  // Os cabeçalhos da requisição só são lidos quando não há configuração.
  return { origin: await input.requestOrigin(), ignoredAppUrl };
}
