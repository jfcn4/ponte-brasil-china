import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { PresentationLab } from "@/components/producer/PresentationLab";
import { getLabState } from "@/modules/products/publication";
import { findCurrentStoreId } from "@/modules/stores/session";

export const metadata: Metadata = { title: "Apresentação em chinês" };

export default async function PresentationPage({
  params,
  searchParams,
}: PageProps<"/meu-espaco/produtos/[productId]/apresentacao">) {
  const { productId } = await params;
  if (!z.uuid().safeParse(productId).success) notFound();
  const storeId = await findCurrentStoreId();
  if (!storeId) notFound();
  const lab = await getLabState(storeId, productId);
  if (!lab) notFound();
  const { gerar } = await searchParams;
  return <PresentationLab key={lab.product.id} initial={lab} autoGenerate={gerar === "1"} />;
}
