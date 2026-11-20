"use client";

import { useId, useRef, useState } from "react";
import type { ProductImageView } from "@/modules/products/schema";

export type PendingUpload = {
  key: string;
  fileName: string;
  previewUrl: string;
  status: "processing" | "uploading" | "error";
  message?: string;
};

type Props = {
  images: ProductImageView[];
  uploads: PendingUpload[];
  notice: string | null;
  busyImageId: string | null;
  onAddFiles: (files: File[]) => void;
  onRetry: (key: string) => void;
  onDiscard: (key: string) => void;
  onMakePrimary: (imageId: string) => void;
  onRemove: (imageId: string) => void;
};

const MAX = 3;

export function PhotoManager({
  images,
  uploads,
  notice,
  busyImageId,
  onAddFiles,
  onRetry,
  onDiscard,
  onMakePrimary,
  onRemove,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmingRemoval, setConfirmingRemoval] = useState<string | null>(null);
  const used = images.length + uploads.filter((u) => u.status !== "error").length;
  const remaining = MAX - used;

  const pick = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onAddFiles(Array.from(list));
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-snow" id={`${inputId}-label`}>
          Fotos reais do produto
        </p>
        <p className="text-sm text-mist" aria-live="polite">
          {images.length} de {MAX} fotos
        </p>
      </div>
      <p className="mb-3 text-sm text-mist">
        Deixe o rótulo legível. A primeira é a foto principal.
      </p>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-labelledby={`${inputId}-label`}>
        {images.map((image, index) => {
          const busy = busyImageId === image.id;
          return (
            <li key={image.id} className="overflow-hidden rounded-xl border border-line bg-night">
              <div className="relative aspect-square">
                {image.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do bucket privado
                  <img
                    src={image.url}
                    alt={index === 0 ? "Foto principal" : `Foto ${index + 1}`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-mist">Foto indisponível</span>
                )}
                {index === 0 && (
                  <span className="absolute left-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">
                    Principal
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1 p-2">
                {confirmingRemoval === image.id ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmingRemoval(null);
                        onRemove(image.id);
                      }}
                      className="min-h-9 rounded-md bg-brand px-2 text-sm font-medium text-white"
                    >
                      Confirmar remoção
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemoval(null)}
                      className="min-h-9 rounded-md px-2 text-sm text-mist hover:text-snow"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    {index > 0 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onMakePrimary(image.id)}
                        className="min-h-9 rounded-md border border-line px-2 text-sm text-snow hover:border-coral disabled:opacity-50"
                        aria-label={`Tornar a foto ${index + 1} a principal`}
                      >
                        Tornar principal
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmingRemoval(image.id)}
                      className="min-h-9 rounded-md px-2 text-sm text-mist hover:text-coral disabled:opacity-50"
                      aria-label={`Remover a foto ${index + 1}`}
                    >
                      {busy ? "Atualizando…" : "Remover"}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}

        {uploads.map((upload) => (
          <li key={upload.key} className="overflow-hidden rounded-xl border border-line bg-night">
            <div className="relative aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) antes do envio */}
              <img src={upload.previewUrl} alt="" className="h-full w-full object-contain opacity-50" />
              {upload.status !== "error" && (
                <span className="absolute inset-0 flex items-center justify-center text-sm font-medium text-snow">
                  {upload.status === "processing" ? "Preparando…" : "Enviando…"}
                </span>
              )}
            </div>
            <div className="p-2" role={upload.status === "error" ? "alert" : undefined}>
              {upload.status === "error" ? (
                <>
                  <p className="text-xs text-coral">{upload.message}</p>
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      onClick={() => onRetry(upload.key)}
                      className="min-h-9 flex-1 rounded-md border border-line px-2 text-sm text-snow hover:border-coral"
                    >
                      Tentar novamente
                    </button>
                    <button
                      type="button"
                      onClick={() => onDiscard(upload.key)}
                      className="min-h-9 rounded-md px-2 text-sm text-mist hover:text-snow"
                      aria-label={`Descartar ${upload.fileName}`}
                    >
                      Descartar
                    </button>
                  </div>
                </>
              ) : (
                <p className="truncate text-xs text-mist">{upload.fileName}</p>
              )}
            </div>
          </li>
        ))}

        {remaining > 0 && (
          <li>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                pick(e.dataTransfer.files);
              }}
              className={`flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-3 text-center transition-colors ${
                dragging ? "border-coral bg-coral/10" : "border-line"
              }`}
            >
              <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                className="sr-only"
                onChange={(e) => pick(e.target.files)}
              />
              <label
                htmlFor={inputId}
                className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-panel-2 px-4 text-sm font-medium text-snow ring-1 ring-line hover:ring-coral [input:focus-visible+&]:outline-2 [input:focus-visible+&]:outline-coral"
              >
                {images.length === 0 ? "Adicionar foto" : "Adicionar outra"}
              </label>
              <span className="text-xs text-mist">Arraste fotos para cá ou clique para adicionar</span>
            </div>
          </li>
        )}
      </ul>

      {notice && (
        <p className="mt-3 text-sm text-warn" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
