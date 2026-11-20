"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { BR_STATES, LIMITS, type StoreOrigin } from "@/modules/products/schema";
import { SelectField, TextField } from "./fields";

type Phase = "idle" | "saving" | "saved" | "error";

/** Produtor, cidade, estado e região: valem para todos os produtos da loja. */
export function StoreOriginEditor({ initial }: { initial: StoreOrigin | null }) {
  const router = useRouter();
  const [producer, setProducer] = useState(initial?.producer_name ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState<string>(initial?.state ?? "");
  const [region, setRegion] = useState(initial?.region ?? "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const touch = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setPhase("idle");
  };

  const save = async () => {
    setPhase("saving");
    setMessage(null);
    const orNull = (value: string) => value.trim() || null;
    try {
      const response = await fetch("/api/stores/origin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          producer_name: orNull(producer),
          city: orNull(city),
          state: state || null,
          region: orNull(region),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error?.message ?? data?.message ?? "Não foi possível salvar. Tente de novo.");
      setPhase("saved");
      router.refresh();
    } catch (cause) {
      setPhase("error");
      setMessage(cause instanceof Error ? cause.message : "Não foi possível salvar.");
    }
  };

  return (
    <div className="mt-4 space-y-5">
      <TextField
        label="Nome do produtor ou engenho"
        hint="Necessário para publicar."
        value={producer}
        onChange={touch(setProducer)}
        maxLength={LIMITS.producerName}
        autoComplete="organization"
      />
      <div className="grid gap-5 sm:grid-cols-[1fr_8rem]">
        <TextField label="Cidade" optional value={city} onChange={touch(setCity)} maxLength={LIMITS.city} autoComplete="address-level2" />
        <SelectField
          label="Estado"
          optional
          value={state}
          onChange={touch(setState)}
          options={BR_STATES.map((uf) => ({ value: uf, label: uf }))}
          placeholder="UF"
        />
      </div>
      <TextField
        label="Região"
        optional
        value={region}
        onChange={touch(setRegion)}
        maxLength={LIMITS.region}
        placeholder="Ex.: Norte de Minas, Serra Gaúcha"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={phase === "saving"}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong disabled:opacity-60"
        >
          {phase === "saving" ? "Salvando…" : "Salvar origem"}
        </button>
        <p role="status" className={`text-sm ${phase === "error" ? "text-coral" : "text-mist"}`}>
          {phase === "saved" ? "Origem salva." : phase === "error" ? message : null}
        </p>
      </div>
    </div>
  );
}
