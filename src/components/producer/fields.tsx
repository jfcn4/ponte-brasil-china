"use client";

import { useId } from "react";

const inputBase =
  "block w-full rounded-lg border bg-night px-3 py-2.5 text-base text-snow placeholder:text-mist/60 " +
  "focus:border-coral focus:outline-none focus:ring-1 focus:ring-coral aria-[invalid=true]:border-coral";

type Common = {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  privacy?: "privado";
};

function Label({ id, label, optional, privacy }: { id: string } & Pick<Common, "label" | "optional" | "privacy">) {
  return (
    <label htmlFor={id} className="mb-1.5 flex flex-wrap items-center gap-x-2 text-sm font-medium text-snow">
      {label}
      {optional && <span className="font-normal text-mist">(opcional)</span>}
      {privacy && (
        <span className="text-[0.7rem] font-medium uppercase tracking-wide text-mist">
          Privado · só você vê
        </span>
      )}
    </label>
  );
}

function Help({ id, hint, error, counter }: { id: string; hint?: string; error?: string; counter?: string }) {
  if (!hint && !error && !counter) return null;
  return (
    <div className="mt-1.5 flex justify-between gap-3 text-sm">
      <p id={id} className={error ? "text-coral" : "text-mist"}>
        {error ?? hint}
      </p>
      {counter && <span className="shrink-0 tabular-nums text-mist">{counter}</span>}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  optional,
  privacy,
  value,
  onChange,
  maxLength,
  placeholder,
  autoComplete,
}: Common & {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  autoComplete?: string;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div>
      <Label id={id} label={label} optional={optional} privacy={privacy} />
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={autoComplete ?? "off"}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? helpId : undefined}
        className={`${inputBase} border-line`}
      />
      <Help id={helpId} hint={hint} error={error} />
    </div>
  );
}

export function TextArea({
  label,
  hint,
  error,
  optional,
  privacy,
  value,
  onChange,
  maxLength,
  rows = 4,
  placeholder,
}: Common & { value: string; onChange: (value: string) => void; maxLength: number; rows?: number; placeholder?: string }) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div>
      <Label id={id} label={label} optional={optional} privacy={privacy} />
      <textarea
        id={id}
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={helpId}
        className={`${inputBase} resize-y border-line leading-relaxed`}
      />
      <Help id={helpId} hint={hint} error={error} counter={`${value.length}/${maxLength}`} />
    </div>
  );
}

/** Campo numérico com a unidade junto ao valor editável (mL, %, meses, R$). */
export function UnitField({
  label,
  hint,
  error,
  optional,
  value,
  onChange,
  unit,
  unitPosition = "suffix",
  inputMode = "numeric",
  placeholder,
}: Common & {
  value: string;
  onChange: (value: string) => void;
  unit: string;
  unitPosition?: "prefix" | "suffix";
  inputMode?: "numeric" | "decimal";
  placeholder?: string;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const unitId = `${id}-unit`;
  return (
    <div>
      <Label id={id} label={label} optional={optional} />
      <div
        className={`flex items-stretch overflow-hidden rounded-lg border bg-night focus-within:border-coral focus-within:ring-1 focus-within:ring-coral ${
          error ? "border-coral" : "border-line"
        }`}
      >
        {unitPosition === "prefix" && (
          <span id={unitId} className="flex items-center border-r border-line bg-panel-2 px-3 text-sm text-mist">
            {unit}
          </span>
        )}
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={[unitId, hint || error ? helpId : null].filter(Boolean).join(" ")}
          className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-base text-snow placeholder:text-mist/60 focus:outline-none"
        />
        {unitPosition === "suffix" && (
          <span id={unitId} className="flex items-center border-l border-line bg-panel-2 px-3 text-sm text-mist">
            {unit}
          </span>
        )}
      </div>
      <Help id={helpId} hint={hint} error={error} />
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  value,
  onChange,
  options,
  placeholder = "Selecione",
}: Common & {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  return (
    <div>
      <Label id={id} label={label} optional={optional} />
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={hint || error ? helpId : undefined}
        className={`${inputBase} border-line`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <Help id={helpId} hint={hint} error={error} />
    </div>
  );
}

export function Section({
  id,
  number,
  title,
  description,
  visibility,
  children,
}: {
  id: string;
  number: number;
  title: string;
  description: string;
  visibility: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="min-w-0 rounded-2xl border border-line bg-panel p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-coral">Seção {number} de 4</p>
          <h2 id={`${id}-title`} className="mt-1 text-xl font-semibold text-snow">
            {title}
          </h2>
        </div>
        <span className="text-xs text-mist">{visibility}</span>
      </div>
      <p className="mt-2 text-sm text-mist">{description}</p>
      <div className="mt-5 grid gap-5 [&>*]:min-w-0">{children}</div>
    </section>
  );
}
