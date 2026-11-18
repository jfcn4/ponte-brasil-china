import { Logo } from "@/components/brand/Logo";
import { SpaceNav } from "@/components/producer/SpaceNav";

export default function SpaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-night/95">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-x-6 px-4 pt-4 sm:px-6">
          <div className="flex items-center gap-3 pb-3">
            <Logo />
            <span className="hidden text-sm text-mist sm:inline">· Meu espaço</span>
          </div>
          <SpaceNav />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line/70">
        <p className="mx-auto w-full max-w-6xl px-4 py-5 text-xs leading-relaxed text-mist sm:px-6">
          Seu acesso a esta loja fica guardado neste navegador, sem conta. Limpar os dados do navegador ou usar uma janela
          anônima abre um espaço separado.
        </p>
      </footer>
    </div>
  );
}
