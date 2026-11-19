"use client";

import { useState } from "react";
import { PublicPhoto } from "./PublicPhoto";

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
      {/* A foto não passa de 60% da altura da tela, para o nome do produto aparecer logo abaixo. */}
      <div className="flex aspect-[4/5] max-h-[60svh] w-full items-center justify-center overflow-hidden rounded-2xl bg-paper">
        <PublicPhoto key={selected.id} src={selected.url} alt={selected.alt} priority className="h-full w-full object-contain" />
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
                  <PublicPhoto src={img.url} alt="" className="h-full w-full object-contain" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
