import type { Metadata } from "next";
import { getStoreOrigin } from "@/modules/products/repository";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Minha loja" };

export default async function MyStorePage() {
  const origin = await getStoreOrigin(await findCurrentStoreId());
  const place = [origin?.city, origin?.state].filter(Boolean).join(", ");
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-snow">Minha loja</h1>
      <div className="mt-6 rounded-xl border border-line bg-panel p-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-mist">Produtor ou engenho</dt>
            <dd className="mt-1 text-snow">{origin?.producer_name ?? "Não informado"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-mist">Cidade e estado</dt>
            <dd className="mt-1 text-snow">{place || "Não informado"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-mist">Região</dt>
            <dd className="mt-1 text-snow">{origin?.region ?? "Não informada"}</dd>
          </div>
        </dl>
        <p className="mt-6 border-t border-line pt-4 text-sm text-mist">
          Estes dados vêm da seção “Origem e história” do cadastro. A loja em chinês, com link e QR, nasce na primeira
          publicação de um produto — etapa liberada na próxima versão.
        </p>
      </div>
    </div>
  );
}
