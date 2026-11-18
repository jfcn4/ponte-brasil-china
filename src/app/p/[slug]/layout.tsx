import { PublicFrame } from "@/components/public/PublicFrame";

/** Área pública (direção B): fundo marfim, textos em chinês. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicFrame>{children}</PublicFrame>;
}

export const viewport = { themeColor: "#faf8f4" };
