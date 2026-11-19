import { Logo } from "@/components/brand/Logo";
import { SpaceNav } from "@/components/producer/SpaceNav";
import { logEvent } from "@/lib/log";
import { countUnreadConversations } from "@/modules/messaging/service";
import { findCurrentStoreId } from "@/modules/stores/session";

async function unreadCount(): Promise<number> {
  // Fora do try: a leitura do cookie sinaliza ao Next que a página é dinâmica.
  const storeId = await findCurrentStoreId();
  if (!storeId) return 0;
  try {
    return await countUnreadConversations(storeId);
  } catch (error) {
    // O badge é secundário: o painel abre mesmo se a contagem falhar.
    logEvent("space.unread_failed", { message: error instanceof Error ? error.message.slice(0, 80) : "unknown" });
    return 0;
  }
}

export default async function SpaceLayout({ children }: { children: React.ReactNode }) {
  const unread = await unreadCount();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line bg-night/95 print:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-x-6 px-4 pt-4 sm:px-6">
          <div className="flex items-center gap-3 pb-3">
            <Logo />
            <span className="hidden text-sm text-mist sm:inline">· Meu espaço</span>
          </div>
          <SpaceNav unreadInitial={unread} />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
