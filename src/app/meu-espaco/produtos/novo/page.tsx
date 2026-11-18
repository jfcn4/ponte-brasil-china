import type { Metadata } from "next";
import { ProductEditor } from "@/components/producer/ProductEditor";
import { draftToForm } from "@/modules/products/form";
import { getStoreOrigin } from "@/modules/products/repository";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Nova cachaça" };

export default async function NewProductPage() {
  // Origem da loja já informada em outro produto vem preenchida.
  const origin = await getStoreOrigin(await findCurrentStoreId());
  return (
    <ProductEditor
      initial={{
        productId: null,
        revision: null,
        updatedAt: null,
        form: draftToForm(null, origin),
        images: [],
        status: "draft",
        publicPath: null,
      }}
    />
  );
}
