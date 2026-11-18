import { EXPLORE_PATH } from "@/modules/explore/paths";

/** Navegação de volta dentro do diretório fictício (loja → diretório, ficha → loja). */
export function BackToDirectory({ store }: { store?: { href: string; name: string } }) {
  return (
    <nav aria-label="返回" className="flex flex-wrap gap-x-4 pb-2">
      {store && (
        <a href={store.href} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline">
          <span aria-hidden="true">←</span> 返回店铺 · <span lang="pt-BR">{store.name}</span>
        </a>
      )}
      <a href={EXPLORE_PATH} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand hover:underline">
        {!store && <span aria-hidden="true">←</span>} 返回品牌目录
      </a>
    </nav>
  );
}
