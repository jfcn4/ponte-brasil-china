import { EXPLORE_TITLE } from "@/modules/explore/directory";
import { exploreHref } from "@/modules/explore/paths";

/**
 * Link discreto para o diretório de marcas fictícias, depois do conteúdo
 * principal das páginas públicas em chinês. `from` é a vitrine real atual,
 * para o diretório oferecer o retorno.
 */
export function ExploreLink({ from }: { from: string }) {
  return (
    <aside aria-label={EXPLORE_TITLE} className="mx-auto w-full max-w-3xl px-4 pb-8 sm:px-6">
      <div className="border-t border-sand pt-5 text-center">
        <a
          href={exploreHref(from)}
          className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-ink-soft underline-offset-4 hover:text-brand hover:underline"
        >
          {EXPLORE_TITLE} <span aria-hidden="true">→</span>
        </a>
      </div>
    </aside>
  );
}
