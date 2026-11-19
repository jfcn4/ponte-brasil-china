import { DEMO_LABEL } from "@/modules/explore/directory";

/** Identificação visível de marca fictícia, em texto simples, presente em todo destino do diretório. */
export function DemoBadge({ className = "", label = DEMO_LABEL }: { className?: string; label?: string }) {
  return <p className={`text-xs font-semibold text-brand ${className}`}>{label}</p>;
}
