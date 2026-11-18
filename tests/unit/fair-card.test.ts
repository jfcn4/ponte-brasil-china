/**
 * Modo Feira (extra · unidade): o cartão é uma projeção do catálogo publicado,
 * com o produto em destaque, o endereço do QR da loja e a forma legível dele.
 */
import { describe, expect, it } from "vitest";
import { buildCatalogView, type CatalogItem } from "@/modules/stores/catalog-view";
import { FAIR_CARD_COPY, buildFairCard, readableUrl } from "@/modules/stores/fair-card";

const ITEM: CatalogItem = {
  slug: "aaaaaaaaaa",
  title: "蓝山醇",
  titleLang: "zh-Hans",
  pinyin: "Lán Shān Chún",
  originalName: "Cachaça Serra Azul",
  tagline: "来自米纳斯的甘蔗烈酒",
  specs: "700 mL · 40% vol",
  image: { url: "https://exemplo.supabase.co/storage/v1/object/sign/foto.jpg?token=x", alt: "蓝山醇 主图" },
  price: { cnyFen: 9085, brlCents: 7900 },
};

const PROFILE = { name: "Engenho Serra Azul", city: "Salinas", state: "MG", region: "Norte de Minas" };
const URL_LOJA = "https://ponte-brasil-china.vercel.app/l/abcde12345";

function catalog(items: CatalogItem[]) {
  return buildCatalogView({ slug: "abcde12345", profile: PROFILE, intro: null, items });
}

describe("cartão para feira", () => {
  it("usa produtor, região e o primeiro publicado (destaque) da loja", () => {
    const second: CatalogItem = { ...ITEM, slug: "bbbbbbbbbb", title: "Cachaça Ouro", titleLang: "pt-BR", pinyin: null, originalName: null };
    const card = buildFairCard(catalog([ITEM, second]), URL_LOJA);
    expect(card).toEqual({
      producer: "Engenho Serra Azul",
      origin: "Salinas, MG · Norte de Minas",
      featured: {
        title: "蓝山醇",
        titleLang: "zh-Hans",
        pinyin: "Lán Shān Chún",
        originalName: "Cachaça Serra Azul",
        image: ITEM.image,
      },
      url: URL_LOJA,
      displayUrl: "ponte-brasil-china.vercel.app/l/abcde12345",
    });
  });

  it("não traz preço, ficha nem textos fora do cartão", () => {
    const card = buildFairCard(catalog([ITEM]), URL_LOJA)!;
    expect(Object.keys(card.featured).sort()).toEqual(["image", "originalName", "pinyin", "title", "titleLang"]);
    expect(JSON.stringify(card)).not.toContain("9085");
    expect(JSON.stringify(card)).not.toContain(ITEM.tagline);
  });

  it("marca original mantida aparece como título, sem pinyin", () => {
    const original: CatalogItem = { ...ITEM, title: "Cachaça Serra Azul", titleLang: "pt-BR", pinyin: null, originalName: null };
    const card = buildFairCard(catalog([original]), URL_LOJA)!;
    expect(card.featured).toMatchObject({ title: "Cachaça Serra Azul", titleLang: "pt-BR", pinyin: null, originalName: null });
  });

  it("loja sem produto publicado não gera cartão (o QR abriria catálogo vazio)", () => {
    expect(buildFairCard(catalog([]), URL_LOJA)).toBeNull();
  });

  it("origem ausente fica ausente", () => {
    const view = buildCatalogView({
      slug: "abcde12345",
      profile: { name: "Engenho Sem Origem", city: null, state: null, region: null },
      intro: null,
      items: [ITEM],
    });
    expect(buildFairCard(view, URL_LOJA)!.origin).toBeNull();
  });

  it("endereço legível = host e caminho do QR, sem protocolo", () => {
    expect(readableUrl("https://ponte-brasil-china.vercel.app/l/abcde12345")).toBe("ponte-brasil-china.vercel.app/l/abcde12345");
    expect(readableUrl("http://localhost:3100/l/abcde12345")).toBe("localhost:3100/l/abcde12345");
    expect(readableUrl("https://exemplo.com/")).toBe("exemplo.com");
  });

  it("chamada fixa nos dois idiomas", () => {
    expect(FAIR_CARD_COPY.cta.zh).toMatch(/[一-鿿]/);
    expect(FAIR_CARD_COPY.cta.pt).toMatch(/catálogo/);
  });
});
