/**
 * T06 (unidade) · Ordem do catálogo e projeção pública da loja: mover para
 * cima/baixo, destaque = primeiro publicado, item com a versão aprovada.
 */
import { describe, expect, it } from "vitest";
import { buildSnapshot } from "@/modules/products/presentation";
import { EMPTY_FORM, formToDraft } from "@/modules/products/form";
import { buildAdaptationInput } from "@/modules/ai/identity-contract";
import { validTestOutput } from "@/modules/ai/test-adapter";
import { buildCatalogView, catalogItemFromSnapshot, featuredProductId, moveInOrder } from "@/modules/stores/catalog-view";
import { productPath, storePath } from "@/lib/paths";

describe("mover para cima/baixo", () => {
  const ids = ["a", "b", "c"];

  it("troca com o vizinho e preserva os demais", () => {
    expect(moveInOrder(ids, "b", "up")).toEqual(["b", "a", "c"]);
    expect(moveInOrder(ids, "b", "down")).toEqual(["a", "c", "b"]);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("não move além das pontas nem item ausente", () => {
    expect(moveInOrder(ids, "a", "up")).toBeNull();
    expect(moveInOrder(ids, "c", "down")).toBeNull();
    expect(moveInOrder(ids, "x", "up")).toBeNull();
  });
});

describe("destaque da loja", () => {
  it("é o primeiro publicado na ordem; rascunhos não contam", () => {
    expect(
      featuredProductId([
        { id: "rascunho", isPublic: false },
        { id: "segunda", isPublic: true },
        { id: "primeira", isPublic: true },
      ]),
    ).toBe("segunda");
    expect(featuredProductId([{ id: "rascunho", isPublic: false }])).toBeNull();
  });
});

describe("projeção pública", () => {
  function snapshot(overrides: Partial<typeof EMPTY_FORM>, choice: "semantica" | "original" = "semantica") {
    const draft = formToDraft({
      ...EMPTY_FORM,
      name: "Serra Azul",
      short_description: "Cachaça de alambique.",
      volume_ml: "700",
      abv_percent: "40",
      producer_name: "Engenho Serra Azul",
      city: "Salinas",
      state: "MG",
      region: "Norte de Minas",
      ...overrides,
    });
    if (!draft.ok) throw new Error("draft");
    const output = validTestOutput(buildAdaptationInput(draft.product, draft.store));
    return buildSnapshot({ product: draft.product, store: draft.store, output, choice });
  }

  it("item usa nome escolhido, frase, volume/teor e preço da versão aprovada", () => {
    const item = catalogItemFromSnapshot("abcdefghij", snapshot({ price: "79,00" }), "https://img/1.jpg");
    expect(item).toEqual({
      slug: "abcdefghij",
      title: "蓝山醇",
      titleLang: "zh-Hans",
      pinyin: "Lán Shān Chún",
      originalName: "Serra Azul",
      tagline: "来自巴西的手工卡沙萨",
      specs: "700 mL · 40% vol",
      image: { url: "https://img/1.jpg", alt: "蓝山醇 主图" },
      price: { cnyFen: 9085, brlCents: 7900 },
    });
  });

  it("marca original mantida não repete o nome; sem preço, sem foto e sem ficha ficam ausentes", () => {
    const item = catalogItemFromSnapshot("abcdefghij", snapshot({ volume_ml: "", abv_percent: "" }, "original"), null);
    expect(item).toMatchObject({ title: "Serra Azul", titleLang: "pt-BR", originalName: null, specs: null, image: null, price: null });
  });

  it("loja mostra produtor, origem e apresentação aprovada", () => {
    const view = buildCatalogView({
      slug: "lojaabcdef",
      profile: { name: "Engenho Serra Azul", city: "Salinas", state: "MG", region: "Norte de Minas" },
      intro: { zh: "来自巴西的卡沙萨生产者。", pt: "Produtor de cachaça do Brasil.", approved_at: "2026-11-18" },
      items: [],
    });
    expect(view).toEqual({
      slug: "lojaabcdef",
      producer: "Engenho Serra Azul",
      origin: "Salinas, MG · Norte de Minas",
      intro: "来自巴西的卡沙萨生产者。",
      items: [],
    });
  });

  it("endereços públicos da loja e do produto são distintos e sem segredo", () => {
    expect(storePath("lojaabcdef")).toBe("/l/lojaabcdef");
    expect(productPath("prodabcdef")).toBe("/p/prodabcdef");
  });
});
