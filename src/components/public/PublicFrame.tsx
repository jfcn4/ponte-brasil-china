import { Logo } from "@/components/brand/Logo";
import { ExploreLink } from "@/components/public/ExploreLink";

/** Moldura das páginas do comprador (direção B): fundo marfim, textos em chinês. */
export function PublicFrame({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div lang="zh-Hans" className="theme-light flex min-h-dvh flex-col bg-ivory text-ink">
      <header className="border-b border-sand">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <span lang="pt-BR">
            <Logo tone="light" />
          </span>
          <ExploreLink />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      {note && (
        <footer className="border-t border-sand">
          <p className="mx-auto w-full max-w-3xl px-4 py-5 text-xs leading-relaxed text-ink-soft sm:px-6">{note}</p>
        </footer>
      )}
    </div>
  );
}
