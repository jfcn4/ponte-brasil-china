import { isLoopbackUrl } from "@/lib/origin";

/**
 * Aviso no painel quando o link público usa localhost: o QR só abre neste
 * computador, e o celular da banca não alcança o endereço.
 */
export function LocalLinkWarning({ url, className = "" }: { url: string; className?: string }) {
  if (!isLoopbackUrl(url)) return null;
  return (
    <p className={`rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn print:hidden ${className}`}>
      Endereço <code>localhost</code>: só abre neste computador. Para o celular, use o deploy ou defina <code>APP_URL</code>.
    </p>
  );
}
