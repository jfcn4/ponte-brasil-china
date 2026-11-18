import { Logo } from "@/components/brand/Logo";

/** Área pública (direção B): fundo marfim, textos em chinês. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div lang="zh-Hans" className="theme-light flex min-h-dvh flex-col bg-ivory text-ink">
      <header className="border-b border-sand">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <span lang="pt-BR">
            <Logo tone="light" />
          </span>
          <span className="text-xs text-ink-soft">巴西精品直连</span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-sand">
        <p className="mx-auto w-full max-w-3xl px-4 py-5 text-xs leading-relaxed text-ink-soft sm:px-6">
          本页面信息由巴西生产者提供并确认。价格仅供参考，最终以报价为准。
        </p>
      </footer>
    </div>
  );
}

export const viewport = { themeColor: "#faf8f4" };
