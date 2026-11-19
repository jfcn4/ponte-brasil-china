import { PRODUCT_STATUS_LABELS, type DisplayStatus } from "@/modules/products/schema";

const TONES: Record<DisplayStatus, string> = {
  draft: "text-warn",
  published: "text-ok",
  pending: "text-coral",
  withdrawn: "text-mist",
};

/** Estado do produto em texto simples, sob o nome (nunca só por cor). */
export function StatusLabel({ status, className = "" }: { status: DisplayStatus; className?: string }) {
  return <p className={`text-sm font-medium ${TONES[status]} ${className}`}>{PRODUCT_STATUS_LABELS[status]}</p>;
}
