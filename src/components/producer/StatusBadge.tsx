import { PRODUCT_STATUS_LABELS, type DisplayStatus } from "@/modules/products/schema";

const TONES: Record<DisplayStatus, string> = {
  draft: "border-warn/40 bg-warn/10 text-warn",
  published: "border-ok/40 bg-ok/10 text-ok",
  pending: "border-coral/50 bg-coral/10 text-coral",
  withdrawn: "border-line bg-panel-2 text-mist",
};

/** Estado do produto por texto (nunca só por cor). */
export function StatusBadge({ status }: { status: DisplayStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[status]}`}>
      {PRODUCT_STATUS_LABELS[status]}
    </span>
  );
}
