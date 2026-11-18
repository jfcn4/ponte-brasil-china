import type { Metadata } from "next";
import { PublicFrame } from "@/components/public/PublicFrame";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Diretório de marcas fictícias (extra, direção B). Dados estáticos, sem banco. */
export default function ExploreLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicFrame note="本目录中的品牌、产品与价格均为虚构，仅用于演示浏览方式，不代表真实生产者，也无法发起询价。">
      {children}
    </PublicFrame>
  );
}

export const viewport = { themeColor: "#faf8f4" };
