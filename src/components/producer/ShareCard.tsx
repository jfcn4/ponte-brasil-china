"use client";

import { type Ref, useState } from "react";

/** Link público e QR individual do produto, com alternativa copiável ao QR. */
export function ShareCard({
  url,
  qrSvg,
  qrPngDataUrl,
  fileName,
  headingRef,
}: {
  url: string;
  qrSvg: string;
  qrPngDataUrl: string;
  fileName: string;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };

  return (
    <section id="compartilhar" aria-labelledby="compartilhar-titulo" className="mt-8 rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <h2 id="compartilhar-titulo" ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-snow">
        Link e QR do produto
      </h2>
      <p className="mt-1 text-sm text-mist">
        Este QR abre diretamente a vitrine deste produto. O endereço não muda quando você edita ou republica.
      </p>
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        <figure className="w-48 shrink-0">
          <div
            role="img"
            aria-label={`QR code da vitrine: ${url}`}
            className="overflow-hidden rounded-xl bg-white p-1 [&_svg]:h-auto [&_svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <figcaption className="mt-2 text-xs text-mist">Aponte a câmera do celular para abrir.</figcaption>
        </figure>
        <div className="min-w-0 flex-1 space-y-3">
          <label className="block text-sm font-medium text-snow" htmlFor="link-publico">
            Link público
          </label>
          <input
            id="link-publico"
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
            className="block w-full rounded-lg border border-line bg-night px-3 py-2.5 text-sm text-snow"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral"
            >
              Copiar link
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral"
            >
              Abrir vitrine <span className="sr-only">(nova aba)</span>
            </a>
            <a
              href={qrPngDataUrl}
              download={fileName}
              className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-medium text-snow hover:border-coral"
            >
              Baixar QR (PNG)
            </a>
          </div>
          <p role="status" className="text-sm text-ok">
            {copied === "ok" ? "Link copiado." : ""}
          </p>
          {copied === "fail" && <p className="text-sm text-coral">Não foi possível copiar. Selecione o link acima e copie.</p>}
        </div>
      </div>
    </section>
  );
}
