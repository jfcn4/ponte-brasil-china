"use client";

import { useEffect, useRef, useState } from "react";

type State = "loading" | "ready" | "failed";

/**
 * Foto pública (URL assinada e temporária do bucket privado). Mostra um fundo
 * de espera enquanto carrega e, se falhar (rede lenta ou link expirado após
 * uma hora com a página aberta), um aviso em chinês com "重新加载", que monta
 * a página de novo com links novos.
 */
export function PublicPhoto({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className: string;
  /** Foto principal acima da dobra: carrega primeiro; as demais esperam a rolagem. */
  priority?: boolean;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const [state, setState] = useState<State>("loading");

  // A imagem pode terminar (ou falhar) antes da hidratação, sem disparar onLoad/onError no React.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete) setState(img.naturalWidth > 0 ? "ready" : "failed");
    else setState("loading");
  }, [src]);

  if (state === "failed") {
    return (
      <div role="img" aria-label={alt} className={`flex flex-col items-center justify-center gap-2 bg-sand/40 p-4 text-center ${className}`}>
        <span lang="zh-Hans" className="text-sm text-ink-soft">
          图片加载失败
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex min-h-10 items-center rounded-lg border border-brand/60 bg-paper px-3 text-sm font-medium text-brand"
        >
          重新加载
        </button>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária, sem otimização do next/image
    <img
      ref={ref}
      src={src}
      alt={alt}
      decoding="async"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      onLoad={() => setState("ready")}
      onError={() => setState("failed")}
      aria-busy={state === "loading" || undefined}
      className={`${className} transition-opacity duration-300 motion-reduce:transition-none ${
        state === "ready" ? "opacity-100" : "animate-pulse bg-sand/60 opacity-60 motion-reduce:animate-none"
      }`}
    />
  );
}
