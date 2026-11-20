"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/client/fetch-json";
import type { DeletionImpact, DeletionResult, ProductListItem } from "@/modules/products/repository";

export type DeletionOutcome = {
  deleted: DeletionResult;
  catalogRevision: number;
  products: ProductListItem[];
};

type Phase =
  | { step: "loading" }
  | { step: "ready"; impact: DeletionImpact; warning?: string }
  | { step: "deleting"; impact: DeletionImpact }
  | { step: "error"; text: string; impact?: DeletionImpact; retry: "load" | "delete" };

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * Confirmação da exclusão definitiva. Busca o nome e o número de conversas no
 * servidor ao abrir, envia o número exibido na exclusão (se chegar conversa
 * nova, o servidor recusa e a tela mostra o número atualizado) e só fecha
 * depois de o servidor confirmar.
 */
export function DeleteProductDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onDeleted: (outcome: DeletionOutcome, name: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>({ step: "loading" });
  const targetId = target?.id ?? null;

  const load = useCallback(
    async (warning?: string) => {
      if (!targetId) return;
      setPhase({ step: "loading" });
      const result = await fetchJson<{ impact: DeletionImpact }>(`/api/products/${targetId}/deletion`);
      if (result.ok) setPhase({ step: "ready", impact: result.data.impact, warning });
      else if (result.status === 404) setPhase({ step: "error", text: "Este produto não existe mais nesta loja. Feche para atualizar a lista.", retry: "load" });
      else setPhase({ step: "error", text: result.message, retry: "load" });
    },
    [targetId],
  );

  // Abre ao receber um produto; fecha ao limpar.
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (targetId) {
      if (!el.open) el.showModal();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- busca ao abrir
      void load();
    } else if (el.open) {
      el.close();
    }
  }, [targetId, load]);

  const confirm = async (impact: DeletionImpact) => {
    if (!target) return;
    setPhase({ step: "deleting", impact });
    const result = await fetchJson<DeletionOutcome>(
      `/api/products/${target.id}`,
      { method: "DELETE", json: { expectedConversations: impact.conversationCount } },
      "Sem conexão. Nada foi apagado; tente de novo.",
    );
    if (result.ok) {
      onDeleted(result.data, impact.name ?? target.name);
      return;
    }
    if (result.status === 409 && result.code === "conversations_changed") {
      await load("O número de conversas mudou desde que você abriu esta tela. Confira e confirme de novo.");
      return;
    }
    if (result.status === 404) {
      // Já excluído (outra aba ou repetição): o painel só precisa se realinhar.
      setPhase({ step: "error", text: "Este produto já foi excluído. Feche para atualizar a lista.", retry: "load" });
      return;
    }
    setPhase({ step: "error", text: result.message, impact, retry: "delete" });
  };

  const busy = phase.step === "loading" || phase.step === "deleting";
  const name = target?.name ?? "";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="excluir-titulo"
      aria-describedby="excluir-aviso"
      onCancel={(event) => {
        if (phase.step === "deleting") event.preventDefault();
        else onClose();
      }}
      onClose={() => {
        if (targetId) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl border border-line bg-panel p-0 text-snow backdrop:bg-black/60"
    >
      <div className="p-5 sm:p-6">
        <h2 id="excluir-titulo" className="text-lg font-semibold">
          Excluir produto
        </h2>
        <p className="mt-3 break-words text-base font-semibold">{name}</p>

        <div aria-live="polite" className="mt-3 min-h-6 text-sm">
          {phase.step === "loading" && <p className="text-mist">Conferindo as conversas deste produto…</p>}
          {(phase.step === "ready" || phase.step === "deleting") && (
            <p>
              {phase.impact.conversationCount === 0
                ? "Nenhuma conversa será apagada."
                : `${plural(phase.impact.conversationCount, "conversa será apagada", "conversas serão apagadas")} (${plural(phase.impact.messageCount, "mensagem", "mensagens")}).`}
            </p>
          )}
        </div>
        {phase.step === "ready" && phase.warning && (
          <p role="alert" className="mt-2 text-sm text-warn">
            {phase.warning}
          </p>
        )}
        {phase.step === "error" && (
          <p role="alert" className="mt-2 text-sm text-coral">
            {phase.text}
          </p>
        )}

        <p id="excluir-aviso" className="mt-4 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm">
          Apaga o produto e suas conversas, sem volta.
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            autoFocus
            disabled={phase.step === "deleting"}
            onClick={onClose}
            className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium hover:border-coral disabled:opacity-60"
          >
            Cancelar
          </button>
          {phase.step === "error" && phase.retry === "load" ? (
            <button
              type="button"
              onClick={() => void load()}
              className="min-h-11 rounded-lg border border-line px-4 text-sm font-medium hover:border-coral"
            >
              Tentar de novo
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || (phase.step === "error" && !phase.impact)}
              onClick={() => {
                const impact = phase.step === "ready" || phase.step === "error" ? phase.impact : undefined;
                if (impact) void confirm(impact);
              }}
              className="min-h-11 rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
            >
              {phase.step === "deleting" ? "Excluindo…" : "Excluir definitivamente"}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
