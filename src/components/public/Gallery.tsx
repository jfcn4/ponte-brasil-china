"use client";

import { useState } from "react";

type Image = { id: string; url: string; alt: string };

/** Galeria da vitrine: foto principal grande e miniaturas selecionáveis por toque ou teclado. */
export function Gallery({ images }: { images: Image[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = images.find((img) => img.id === selectedId) ?? images[0];

  if (!selected) {
    return (
      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-2xl border border-dashed border-sand bg-paper text-center text-sm text-ink-soft">
        <span lang="pt-BR" className="px-6">
          A foto principal aparece aqui.
        </span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-2xl bg-paper">
        {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária */}
        <img src={selected.url} alt={selected.alt} className="h-full w-full object-contain" />
      </div>
      {images.length > 1 && (
        <ul className="mt-3 flex gap-2" aria-label="Fotos">
          {images.map((img) => {
            const active = img.id === selected.id;
            return (
              <li key={img.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(img.id)}
                  aria-pressed={active}
                  aria-label={img.alt}
                  className={`block h-16 w-16 overflow-hidden rounded-lg border-2 bg-paper ${
                    active ? "border-brand" : "border-transparent opacity-80 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária */}
                  <img src={img.url} alt="" className="h-full w-full object-contain" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
