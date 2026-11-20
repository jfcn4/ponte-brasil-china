import { z } from "zod";
import { PresentationSnapshot } from "@/modules/products/presentation";
import { formatOrigin } from "@/modules/products/showcase";

/**
 * Catálogo público da loja: projeção só de campos aprovados. O mesmo modelo
 * alimenta a página do comprador (/l/<código>) e a prévia em "Minha loja".
 */

/** Cópia aprovada do produtor e da origem (snapshot.producer da versão mais recente). */
export const StorePublicProfile = PresentationSnapshot.shape.producer;
export type StorePublicProfile = z.infer<typeof StorePublicProfile>;

/** Apresentação da loja escrita pelo produtor em português e traduzida; aprovada por ele. */
export const StoreIntro = z
  .object({
    zh: z.string().min(1),
    pt: z.string().min(1),
    approved_at: z.string(),
  })
  .strict();
export type StoreIntro = z.infer<typeof StoreIntro>;

export type CatalogItem = {
  /** Código público da vitrine individual (/p/<código>). */
  slug: string;
  title: string;
  titleLang: "zh-Hans" | "pt-BR";
  pinyin: string | null;
  /** Nome brasileiro quando o título é o nome chinês. */
  originalName: string | null;
  tagline: string;
  /** Volume e teor, só quando informados na versão aprovada. */
  specs: string | null;
  image: { url: string; alt: string } | null;
  price: { cnyFen: number; brlCents: number } | null;
  /** Categoria exibida no destaque; ausente = cachaça (o MVP). */
  category?: string;
  /** Selo curto no cartão, ex. a identificação de demonstração das lojas fictícias. */
  tag?: string;
};

export type StoreCatalogView = {
  slug: string;
  producer: string;
  origin: string | null;
  intro: string | null;
  /** Linha acima do nome; ausente = produtor de cachaça (o MVP). */
  kicker?: string;
  /** Produtos publicados na ordem da loja; o primeiro é o destaque. */
  items: CatalogItem[];
};

function formatSpecs(snapshot: PresentationSnapshot): string | null {
  const a = snapshot.facts.attributes;
  const parts: string[] = [];
  if (a.volume_ml !== null) parts.push(`${a.volume_ml} mL`);
  if (a.abv_percent !== null) parts.push(`${Number.isInteger(a.abv_percent) ? a.abv_percent : a.abv_percent.toFixed(1)}% vol`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Item do catálogo a partir da versão publicada de um produto e da sua foto principal. */
export function catalogItemFromSnapshot(slug: string, snapshot: PresentationSnapshot, imageUrl: string | null): CatalogItem {
  return {
    slug,
    title: snapshot.name.display,
    titleLang: snapshot.name.display_lang,
    pinyin: snapshot.name.pinyin,
    originalName: snapshot.choice === "original" ? null : snapshot.name.original,
    tagline: snapshot.content.tagline_zh,
    specs: formatSpecs(snapshot),
    image: imageUrl ? { url: imageUrl, alt: `${snapshot.name.display} 主图` } : null,
    price: snapshot.price ? { cnyFen: snapshot.price.cny_fen, brlCents: snapshot.price.brl_cents } : null,
  };
}

export function buildCatalogView(input: {
  slug: string;
  profile: StorePublicProfile;
  intro: StoreIntro | null;
  items: CatalogItem[];
}): StoreCatalogView {
  return {
    slug: input.slug,
    producer: input.profile.name,
    origin: formatOrigin(input.profile),
    intro: input.intro?.zh ?? null,
    items: input.items,
  };
}

/**
 * Nova ordem após "Mover para cima/baixo". Devolve null quando o movimento
 * não é possível (primeiro item para cima, último para baixo, id ausente).
 */
export function moveInOrder(ids: readonly string[], id: string, direction: "up" | "down"): string[] | null {
  const index = ids.indexOf(id);
  if (index < 0) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** Destaque da loja: o primeiro produto publicado na ordem (rascunhos não contam). */
export function featuredProductId<T extends { id: string; isPublic: boolean }>(products: readonly T[]): string | null {
  return products.find((p) => p.isPublic)?.id ?? null;
}
