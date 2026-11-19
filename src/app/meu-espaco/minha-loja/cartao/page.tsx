import type { Metadata } from "next";
import Link from "next/link";
import { FairCardView } from "@/components/producer/fair/FairCardView";
import { PrintCardButton } from "@/components/producer/fair/PrintCardButton";
import { LocalLinkWarning } from "@/components/producer/LocalLinkWarning";
import { getStoreOverview } from "@/modules/stores/catalog";
import { buildFairCard } from "@/modules/stores/fair-card";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Cartão para feira" };

/** Uma página A4 em pé, margens de impressão comuns às impressoras domésticas. */
const PRINT_PAGE_CSS = "@page { size: A4 portrait; margin: 12mm; }";

function Unavailable({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-snow">Cartão para feira</h1>
      <div className="mt-6 rounded-xl border border-line bg-panel p-6">
        <p className="text-snow">{children}</p>
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

/**
 * Modo Feira (extra). Cartão bilíngue montado só com o perfil e o catálogo
 * publicados da loja desta sessão, com o mesmo QR e endereço de "Minha loja".
 */
export default async function FairCardPage() {
  const storeId = await findCurrentStoreId();
  const live = storeId ? ((await getStoreOverview(storeId))?.public ?? null) : null;

  if (!live) {
    return <Unavailable>O cartão usa a loja publicada. Publique o primeiro produto para criar a loja em chinês e o QR.</Unavailable>;
  }
  const card = buildFairCard(live.catalog, live.url);
  if (!card) {
    return (
      <Unavailable>
        A loja está sem produtos publicados: o QR abriria um catálogo vazio. Publique um produto para criar o cartão.
      </Unavailable>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-8 sm:px-6 print:max-w-none print:p-0">
      <style>{PRINT_PAGE_CSS}</style>
      <div className="print:hidden">
        <Link href="/meu-espaco/minha-loja" className="text-sm text-coral underline underline-offset-2">
          ← Minha loja
        </Link>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-snow">Cartão para feira</h1>
        <p className="mt-1 max-w-3xl text-sm text-mist">
          Modo Feira · extra. Cartão em português e chinês para entregar ou expor no estande. Usa só o que já está publicado:
          o perfil aprovado da loja, o produto em destaque e o mesmo QR e endereço de Minha loja. O QR abre o catálogo da
          loja, com todos os produtos publicados; o endereço não muda ao reordenar, editar ou republicar.
        </p>
      </div>

      <LocalLinkWarning url={live.url} className="mt-4" />

      <section aria-labelledby="previa-cartao" className="mt-6 print:mt-0">
        <h2 id="previa-cartao" className="sr-only">
          Prévia do cartão
        </h2>
        <div className="rounded-3xl bg-ivory p-3 sm:p-6 print:rounded-none print:bg-transparent print:p-0">
          <FairCardView card={card} qrSvg={live.qrSvg} />
        </div>
      </section>

      <div className="mt-6 grid gap-6 print:hidden lg:grid-cols-2">
        <PrintCardButton cardId="cartao-feira" />
        <div className="text-sm text-mist">
          <p>
            Na janela de impressão, escolha <strong className="text-snow">Salvar como PDF</strong> como destino para guardar
            o arquivo, ou a sua impressora. O cartão cabe em uma folha A4, sem o menu do painel.
          </p>
          <p className="mt-2">
            Para mudar o destaque, reordene em{" "}
            <Link href="/meu-espaco/produtos" className="text-coral underline underline-offset-2">
              Produtos
            </Link>
            ; para mudar nome ou região, edite o cadastro e republique um produto.
          </p>
        </div>
      </div>
    </div>
  );
}
