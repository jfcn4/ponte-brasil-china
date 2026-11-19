import type { Metadata } from "next";
import { PublicFrame } from "@/components/public/PublicFrame";

export const metadata: Metadata = {
  title: { absolute: "询价对话 · BAQIAO 巴桥" },
  robots: { index: false, follow: false },
  // O segredo fica no fragmento (#t=…), que o navegador não envia; por garantia, sem Referer.
  referrer: "no-referrer",
};

export const viewport = { themeColor: "#faf8f4" };

export default function BuyerConversationLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicFrame note="本对话为私密对话，仅持有私密链接的人可以查看。生产者的回复经其本人确认后发送。">{children}</PublicFrame>
  );
}
