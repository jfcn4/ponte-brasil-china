"use client";

import { useState } from "react";

/**
 * Abre a impressão do navegador (onde também se escolhe "Salvar como PDF").
 * Antes, espera a foto do cartão carregar: a URL assinada expira em 1 h, e
 * imprimir com a foto quebrada geraria um cartão sem produto.
 */
export function PrintCardButton({ cardId }: { cardId: string }) {
  const [state, setState] = useState<"idle" | "preparing" | "photo_failed">("idle");

  const print = async () => {
    setState("preparing");
    const images = Array.from(document.querySelectorAll<HTMLImageElement>(`#${cardId} img`));
    try {
      await Promise.all(images.map((img) => img.decode()));
    } catch {
      setState("photo_failed");
      return;
    }
    setState("idle");
    window.print();
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void print()}
        disabled={state === "preparing"}
        className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
      >
        {state === "preparing" ? "Preparando o cartão…" : "Imprimir ou salvar em PDF"}
      </button>
      <div role="alert" className="text-sm">
        {state === "photo_failed" && (
          <p className="rounded-lg border border-coral/40 bg-coral/10 p-3 text-snow">
            A foto do produto não carregou (o acesso temporário pode ter expirado ou a rede caiu). Nada foi impresso.{" "}
            <button type="button" onClick={() => window.location.reload()} className="font-semibold text-coral underline underline-offset-2">
              Recarregar o cartão
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
