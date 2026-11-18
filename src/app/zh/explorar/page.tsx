import type { Metadata } from "next";
import { DemoBadge } from "@/components/public/explore/DemoBadge";
import { ReturnToOrigin } from "@/components/public/explore/ReturnToOrigin";
import { DEMO_LABEL, DEMO_STORES, EXPLORE_TITLE } from "@/modules/explore/directory";
import { demoStorePath } from "@/modules/explore/paths";

export const metadata: Metadata = {
  title: { absolute: `${EXPLORE_TITLE} · ${DEMO_LABEL}` },
};

/** Diretório: três lojas fictícias, cada uma levando ao próprio catálogo. */
export default function ExploreDirectoryPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <nav aria-label="返回" className="min-h-11">
        <ReturnToOrigin />
      </nav>

      <header className="px-1 pb-6 pt-2">
        <DemoBadge />
        <h1 className="mt-3 font-[family-name:var(--font-zh-serif)] text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          {EXPLORE_TITLE}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink">
          浏览来自巴西不同地区的示例店铺，了解卡沙萨、咖啡与蜂蜜生产者如何展示自己的产品。
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          以下品牌均为虚构，仅用于演示，无法发起询价。
        </p>
      </header>

      <ul className="grid gap-4" aria-label="示例店铺">
        {DEMO_STORES.map((store) => {
          const cover = store.products[0]!;
          return (
            <li key={store.slug}>
              <a
                href={demoStorePath(store.slug)}
                className="group flex h-full gap-4 overflow-hidden rounded-2xl border border-sand bg-paper p-3 hover:border-brand/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:p-4"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- ilustração estática em SVG */}
                <img src={cover.image} alt="" className="h-32 w-26 shrink-0 rounded-xl bg-sand/40 object-contain sm:h-40 sm:w-32" />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <DemoBadge />
                  <p className="text-xs font-medium tracking-wide text-brand">{store.kicker}</p>
                  <p lang="pt-BR" className="text-xl font-semibold leading-snug text-ink">
                    {store.name}
                  </p>
                  <p lang="pt-BR" className="text-sm text-ink-soft">
                    {store.origin}
                  </p>
                  <p className="line-clamp-2 text-sm leading-relaxed text-ink">{store.intro}</p>
                  <span className="mt-auto pt-1 text-sm font-medium text-brand group-hover:underline">
                    进入店铺 · {store.products.length} 款产品 <span aria-hidden="true">→</span>
                  </span>
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
