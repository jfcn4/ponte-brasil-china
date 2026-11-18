import { PublicFrame } from "@/components/public/PublicFrame";

/** Catálogo público da loja (direção B): fundo marfim, textos em chinês. */
export default function PublicStoreLayout({ children }: { children: React.ReactNode }) {
  return <PublicFrame>{children}</PublicFrame>;
}

export const viewport = { themeColor: "#faf8f4" };
