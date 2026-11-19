"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Menu “Mais ações” de um produto. Hoje tem só Excluir produto, que abre a
 * confirmação no componente pai. Teclado: Enter/Espaço/seta abrem e focam o
 * item; Esc fecha e devolve o foco ao botão; clicar fora fecha.
 */
export function ProductActionsMenu({
  productLabel,
  onDelete,
  disabled,
}: {
  productLabel: string;
  onDelete: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    item.current?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };

  return (
    <div
      ref={root}
      className="relative"
      onKeyDown={(event) => {
        if (open && event.key === "Escape") {
          event.preventDefault();
          close(true);
        }
        if (open && event.key === "Tab") setOpen(false);
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Mais ações de ${productLabel}`}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 w-11 items-center justify-center rounded-lg border border-line text-snow hover:border-coral focus-visible:outline-2 focus-visible:outline-coral disabled:opacity-40"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
          <circle cx="3" cy="9" r="1.6" />
          <circle cx="9" cy="9" r="1.6" />
          <circle cx="15" cy="9" r="1.6" />
        </svg>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={`Ações de ${productLabel}`}
          className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-lg border border-line bg-panel p-1 shadow-xl shadow-black/50"
        >
          <button
            ref={item}
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm font-medium text-coral hover:bg-coral/10 focus-visible:bg-coral/10 focus-visible:outline-2 focus-visible:outline-coral"
          >
            Excluir produto
          </button>
        </div>
      )}
    </div>
  );
}
