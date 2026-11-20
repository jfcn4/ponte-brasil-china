"use client";

import { useState } from "react";

type Intro = { zh: string; pt: string } | null;
type Phase = "idle" | "translating" | "saving";

const MAX = 400;

/**
 * Apresentação da loja: o produtor escreve em português, revisa a tradução
 * chinesa e só então aprova. Nada vai ao catálogo antes da aprovação.
 */
export function StoreIntroEditor({ initial }: { initial: Intro }) {
  const [saved, setSaved] = useState<Intro>(initial);
  const [editing, setEditing] = useState(initial === null);
  const [pt, setPt] = useState(initial?.pt ?? "");
  const [preview, setPreview] = useState<{ pt: string; zh: string; warnings: string[] } | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const post = async (body: object) => {
    const response = await fetch("/api/stores/intro", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error?.message ?? data?.message ?? "Não foi possível concluir. Tente de novo.");
    return data;
  };

  const translate = async () => {
    setPhase("translating");
    setError(null);
    try {
      const data = await post({ action: "translate", pt: pt.trim() });
      setPreview({ pt: pt.trim(), zh: data.zh, warnings: data.warnings ?? [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha na tradução.");
    } finally {
      setPhase("idle");
    }
  };

  const approve = async () => {
    if (!preview) return;
    setPhase("saving");
    setError(null);
    try {
      const data = await post({ action: "approve", pt: preview.pt, zh: preview.zh });
      setSaved({ pt: data.intro.pt, zh: data.intro.zh });
      setPreview(null);
      setEditing(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar.");
    } finally {
      setPhase("idle");
    }
  };

  const busy = phase !== "idle";
  const button = "inline-flex min-h-11 items-center rounded-lg px-5 text-sm font-semibold disabled:opacity-60";

  if (!editing && saved) {
    return (
      <div className="mt-1 space-y-2">
        <p lang="zh-Hans" className="text-lg leading-relaxed text-snow">
          {saved.zh}
        </p>
        <p className="text-sm text-mist">
          Em português: <span className="text-snow">{saved.pt}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            setPt(saved.pt);
            setEditing(true);
          }}
          className="text-sm text-coral underline underline-offset-2"
        >
          Reescrever
        </button>
      </div>
    );
  }

  return (
    <div className="mt-1 space-y-3">
      <label className="block text-sm text-mist" htmlFor="intro-pt">
        Escreva em português um resumo da sua loja (quem é você, de onde vem e o que a distingue).
      </label>
      <textarea
        id="intro-pt"
        value={pt}
        maxLength={MAX}
        rows={4}
        onChange={(event) => {
          setPt(event.target.value);
          setPreview(null);
        }}
        className="w-full rounded-lg border border-line bg-ink p-3 text-snow"
      />
      <p className="text-xs text-mist">
        {pt.trim().length}/{MAX} caracteres
      </p>
      {!preview && (
        <button
          type="button"
          onClick={translate}
          disabled={busy || pt.trim().length < 10}
          className={`${button} bg-brand text-white hover:bg-brand-strong`}
        >
          {phase === "translating" ? "Traduzindo…" : "Traduzir para chinês"}
        </button>
      )}
      {preview && (
        <div className="space-y-3 rounded-lg border border-line p-3" aria-live="polite">
          <p className="text-xs uppercase tracking-wide text-mist">Tradução para revisar</p>
          <p lang="zh-Hans" className="text-lg leading-relaxed text-snow">
            {preview.zh}
          </p>
          {preview.warnings.length > 0 && (
            <ul className="list-disc pl-5 text-sm text-coral">
              {preview.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={approve} disabled={busy} className={`${button} bg-brand text-white hover:bg-brand-strong`}>
              {phase === "saving" ? "Salvando…" : "Aprovar apresentação"}
            </button>
            <button type="button" onClick={translate} disabled={busy} className={`${button} border border-line text-snow`}>
              Traduzir de novo
            </button>
          </div>
        </div>
      )}
      {saved && (
        <button type="button" onClick={() => { setEditing(false); setPreview(null); }} className="block text-sm text-mist underline underline-offset-2">
          Cancelar
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-coral">
          {error}
        </p>
      )}
    </div>
  );
}
