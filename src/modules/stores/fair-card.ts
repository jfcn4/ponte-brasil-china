import type { StoreCatalogView } from "./catalog-view";

/**
 * Modo Feira (extra): cartão comercial bilíngue para imprimir. Projeção do
 * catálogo público já aprovado; não lê rascunhos nem o cadastro em edição.
 * O QR e o endereço são os mesmos de "Minha loja" (catálogo /l/<código>).
 */

/** Chamada fixa da aplicação, sem IA: igual para todas as lojas. */
export const FAIR_CARD_COPY = {
  kicker: { zh: "巴西卡沙萨生产者", pt: "Produtor de cachaça artesanal do Brasil" },
  cta: { zh: "扫码浏览我们的产品目录", pt: "Aponte a câmera e conheça nosso catálogo" },
  typeIt: { zh: "或在浏览器中输入", pt: "ou digite no navegador" },
  originLabel: "产地",
} as const;

export type FairCard = {
  producer: string;
  origin: string | null;
  featured: {
    title: string;
    titleLang: "zh-Hans" | "pt-BR";
    pinyin: string | null;
    originalName: string | null;
    image: { url: string; alt: string } | null;
  };
  /** Endereço completo do QR. */
  url: string;
  /** Mesmo endereço sem o protocolo, para digitar. */
  displayUrl: string;
};

/** Endereço legível: host e caminho, sem protocolo nem barra final. */
export function readableUrl(url: string): string {
  const parsed = new URL(url);
  return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
}

/**
 * Monta o cartão a partir do catálogo publicado. Null quando a loja não tem
 * produto publicado: o QR abriria um catálogo vazio.
 */
export function buildFairCard(catalog: StoreCatalogView, url: string): FairCard | null {
  const featured = catalog.items[0];
  if (!featured) return null;
  return {
    producer: catalog.producer,
    origin: catalog.origin,
    featured: {
      title: featured.title,
      titleLang: featured.titleLang,
      pinyin: featured.pinyin,
      originalName: featured.originalName,
      image: featured.image,
    },
    url,
    displayUrl: readableUrl(url),
  };
}
