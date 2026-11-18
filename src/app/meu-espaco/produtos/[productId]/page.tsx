import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { ProductEditor } from "@/components/producer/ProductEditor";
import { draftToForm } from "@/modules/products/form";
import { getProductForEdit, getStoreOrigin } from "@/modules/products/repository";
import { rowToDraft } from "@/modules/products/schema";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Editar cachaça" };

export default async function EditProductPage({ params }: PageProps<"/meu-espaco/produtos/[productId]">) {
  const { productId } = await params;
  if (!z.uuid().safeParse(productId).success) notFound();

  // Só a loja desta sessão lê o rascunho; de outra loja, a resposta é 404.
  const storeId = await findCurrentStoreId();
  if (!storeId) notFound();
  const [data, origin] = await Promise.all([getProductForEdit(storeId, productId), getStoreOrigin(storeId)]);
  if (!data) notFound();

  return (
    <ProductEditor
      key={data.product.id}
      initial={{
        productId: data.product.id,
        revision: data.product.revision,
        updatedAt: data.product.updated_at,
        form: draftToForm(rowToDraft(data.product), origin),
        images: data.images,
      }}
    />
  );
}
