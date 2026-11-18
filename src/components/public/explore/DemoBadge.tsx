import { DEMO_LABEL } from "@/modules/explore/directory";

/** Identificação visível de marca fictícia, presente em todo destino do diretório. */
export function DemoBadge({ className = "" }: { className?: string }) {
  return (
    <p className={`inline-flex w-fit items-center gap-1.5 rounded-full border border-brand/40 bg-brand/5 px-3 py-1 text-xs font-semibold text-brand ${className}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand" />
      {DEMO_LABEL}
    </p>
  );
}
