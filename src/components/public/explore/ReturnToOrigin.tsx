"use client";

import { useEffect, useSyncExternalStore } from "react";
import { EXPLORE_ORIGIN_PARAM, safeOriginPath } from "@/modules/explore/paths";

const KEY = "pg_explore_origin";

function readOrigin(): string | null {
  try {
    const fromUrl = safeOriginPath(new URLSearchParams(window.location.search).get(EXPLORE_ORIGIN_PARAM));
    return fromUrl ?? safeOriginPath(window.sessionStorage.getItem(KEY));
  } catch {
    return null;
  }
}

const subscribe = () => () => {};

/**
 * Retorno à vitrine real de onde o comprador entrou no diretório. O caminho
 * chega no parâmetro do link "Explorar" e fica nesta aba enquanto ele navega
 * pelas marcas fictícias. Sem origem válida, nada é exibido.
 */
export function ReturnToOrigin() {
  const origin = useSyncExternalStore(subscribe, readOrigin, () => null);

  useEffect(() => {
    if (!origin) return;
    try {
      window.sessionStorage.setItem(KEY, origin);
    } catch {
      // Armazenamento bloqueado: o link continua valendo nesta página.
    }
  }, [origin]);

  if (!origin) return null;
  return (
    <a href={origin} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline">
      <span aria-hidden="true">←</span> 返回之前浏览的真实店铺
    </a>
  );
}
