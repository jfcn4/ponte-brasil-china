import type { Metadata } from "next";
import Link from "next/link";
import { ShareCard } from "@/components/producer/ShareCard";
import { StoreCatalog } from "@/components/public/StoreCatalog";
import { formatOrigin } from "@/modules/products/showcase";
import { getStoreOrigin } from "@/modules/products/repository";
import { getStoreOverview } from "@/modules/stores/catalog";
import { DEMO_STORE_LABEL, isDemoStore } from "@/modules/stores/demo";
import { DemoBadge } from "@/components/public/explore/DemoBadge";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Minha loja" };

const dateFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" });

function Field({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-mist">{term}</dt>
      <dd className="mt-1 text-snow">{children}</dd>
    </div>
  );
}

/**
 * Perfil público aprovado, prévia do catálogo (mesmo componente da página do
 * comprador), link e QR da loja. A ordem dos produtos é definida em Produtos.
 */
export default async function MyStorePage() {
  const storeId = await findCurrentStoreId();
  const [origin, overview] = storeId ? await Promise.all([getStoreOrigin(storeId), getStoreOverview(storeId)]) : [null, null];
  const live = overview?.public ?? null;

  if (!live) {
    const place = origin ? formatOrigin(origin) : null;
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-snow">Minha loja</h1>
        <div className="mt-6 rounded-xl border border-line bg-panel p-6">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field term="Produtor ou engenho">{origin?.producer_name ?? "Não informado"}</Field>
            <Field term="Origem">{place ?? "Não informada"}</Field>
          </dl>
          <p className="mt-6 border-t border-line pt-4 text-sm text-mist">
            A loja em chinês, com link e QR, nasce ao publicar o primeiro produto.
          </p>
          <Link
            href="/meu-espaco/produtos"
            className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong"
          >
            Ir para Produtos
          </Link>
        </div>
      </div>
    );
  }

  const { profile, intro, catalog } = live;
  const draftOrigin = origin ? formatOrigin(origin) : null;
  const approvedOrigin = formatOrigin(profile);
  const originChanged = origin !== null && (origin.producer_name !== profile.name || draftOrigin !== approvedOrigin);
  const featured = catalog.items[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-snow">Minha loja</h1>
        <p className="mt-1 text-sm text-mist">
          No ar desde {live.publishedAt ? dateFormat.format(new Date(live.publishedAt)) : "a primeira publicação"} ·{" "}
          {catalog.items.length} {catalog.items.length === 1 ? "produto publicado" : "produtos publicados"}
        </p>
        {isDemoStore(live.slug) && (
          <p className="mt-3 rounded-lg border border-coral/40 bg-coral/10 px-3 py-2 text-sm text-snow">
            Loja de demonstração, com o selo{" "}
            <span lang="zh-Hans" className="font-semibold text-coral">
              演示店铺
            </span>{" "}
            para o comprador.
          </p>
        )}

        <section aria-labelledby="perfil-titulo" className="mt-6 rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <h2 id="perfil-titulo" className="text-lg font-semibold text-snow">
            Perfil público
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field term="Produtor ou engenho">{profile.name}</Field>
            <Field term="Região e origem">{approvedOrigin ?? "Não informada"}</Field>
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-mist">Apresentação chinesa aprovada</dt>
              {intro ? (
                <dd className="mt-1 space-y-2">
                  <p lang="zh-Hans" className="text-lg leading-relaxed text-snow">
                    {intro.zh}
                  </p>
                  <p className="text-sm text-mist">
                    Em português: <span className="text-snow">{intro.pt}</span>
                  </p>
                  <p className="text-xs text-mist">Aprovada em {dateFormat.format(new Date(intro.approved_at))}.</p>
                </dd>
              ) : (
                <dd className="mt-1 text-sm text-mist">
                  Ainda não aprovada. Ela é gerada com os nomes de um produto e aprovada ao publicar.
                </dd>
              )}
            </div>
            <Field term="Destaque da loja">
              {featured ? (
                <>
                  <span lang={featured.titleLang}>{featured.title}</span>
                  {featured.originalName && <span className="text-mist"> · {featured.originalName}</span>}
                </>
              ) : (
                "Nenhum produto publicado"
              )}
            </Field>
            <Field term="Ordem do catálogo">
              <Link href="/meu-espaco/produtos" className="text-coral underline underline-offset-2">
                Reordenar em Produtos
              </Link>
            </Field>
          </dl>
          {originChanged && (
            <p className="mt-4 rounded-lg border border-coral/40 bg-coral/10 p-3 text-sm text-snow">
              Produtor ou origem foram alterados. A loja mostra os novos dados quando você republicar um produto.
            </p>
          )}
        </section>

        <ShareCard
          kind="store"
          url={live.url}
          qrSvg={live.qrSvg}
          qrPngDataUrl={live.qrPngDataUrl}
          fileName={`qr-loja-${live.slug}.png`}
        />

        <section aria-labelledby="feira-titulo" className="mt-8 rounded-2xl border border-line bg-panel p-5 sm:p-6">
          <h2 id="feira-titulo" className="text-lg font-semibold text-snow">
            Modo Feira <span className="text-sm font-normal text-mist">· extra</span>
          </h2>
          <p className="mt-1 text-sm text-mist">Cartão em português e chinês para imprimir ou salvar em PDF.</p>
          {featured ? (
            <Link
              href="/meu-espaco/minha-loja/cartao"
              className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-strong"
            >
              Criar cartão para feira
            </Link>
          ) : (
            <p className="mt-4 text-sm text-snow">Publique um produto para criar o cartão.</p>
          )}
        </section>
      </div>

      <aside className="mt-8 lg:mt-0" aria-labelledby="previa-loja">
        <div className="lg:sticky lg:top-6">
          <h2 id="previa-loja" className="mb-1 text-lg font-semibold text-snow lg:text-sm lg:font-medium">
            Prévia do catálogo
          </h2>
          <div className="rounded-3xl bg-ivory p-3 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
            <StoreCatalog view={catalog} titleAs="h2" notice={isDemoStore(live.slug) ? <DemoBadge label={DEMO_STORE_LABEL} className="mb-3" /> : undefined} />
          </div>
        </div>
      </aside>
    </div>
  );
}
