import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_SC, Noto_Serif_SC } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const notoSansSc = Noto_Sans_SC({
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
  preload: false,
});
const notoSerifSc = Noto_Serif_SC({
  weight: ["600", "700"],
  variable: "--font-noto-serif-sc",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "BAQIAO 巴桥", template: "%s · BAQIAO" },
  description: "Crie sua vitrine em chinês e converse com compradores no seu idioma.",
};

export const viewport: Viewport = {
  themeColor: "#151416",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth" className={`${inter.variable} ${notoSansSc.variable} ${notoSerifSc.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
