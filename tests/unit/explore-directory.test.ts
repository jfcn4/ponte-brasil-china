/**
 * T12 (unidade) · Diretório de marcas fictícias: dados estáticos válidos,
 * identificação de demonstração, preços pela regra única de câmbio e retorno
 * restrito às vitrines reais.
 */
import { describe, expect, it } from "vitest";
import { convertBrlCentsToCnyFen, formatCny } from "@/modules/products/pricing";
import {
  DEMO_LABEL,
  DEMO_STORES,
  demoCatalogView,
  demoShowcaseView,
  findDemoProduct,
  findDemoStore,
} from "@/modules/explore/directory";
import { EXPLORE_PATH, demoProductPath, demoStorePath, exploreHref, safeOriginPath } from "@/modules/explore/paths";

describe("lojas fictícias", () => {
  it("são três, com cachaça e café ou mel como exemplos visuais", () => {
    expect(DEMO_STORES).toHaveLength(3);
    const kinds = DEMO_STORES.map((s) => s.kind);
    expect(kinds).toContain("cachaca");
    expect(kinds.some((k) => k === "cafe" || k === "mel")).toBe(true);
  });

  it("têm endereços únicos e cada produto abre a própria ficha", () => {
    const stores = DEMO_STORES.map((s) => s.slug);
    expect(new Set(stores).size).toBe(stores.length);
    for (const store of DEMO_STORES) {
      expect(store.products.length).toBeGreaterThan(0);
      const products = store.products.map((p) => p.slug);
      expect(new Set(products).size).toBe(products.length);
      for (const product of store.products) {
        expect(findDemoProduct(store.slug, product.slug)?.product).toBe(product);
        expect(demoProductPath(store.slug, product.slug)).toBe(`${EXPLORE_PATH}/${store.slug}/${product.slug}`);
      }
      expect(demoStorePath(store.slug).startsWith(`${EXPLORE_PATH}/`)).toBe(true);
    }
    expect(findDemoStore("inexistente")).toBeNull();
    expect(findDemoProduct(DEMO_STORES[0]!.slug, "inexistente")).toBeNull();
  });

  it("identificam cada produto do catálogo como demonstração", () => {
    for (const store of DEMO_STORES) {
      const view = demoCatalogView(store);
      expect(view.producer).toBe(store.name);
      expect(view.kicker).toBe(store.kicker);
      expect(view.items.map((i) => i.slug)).toEqual(store.products.map((p) => p.slug));
      for (const item of view.items) {
        expect(item.tag).toBe(DEMO_LABEL);
        expect(item.category).toBe(store.category);
      }
    }
  });

  it("convertem o preço pela mesma função da vitrine real", () => {
    for (const store of DEMO_STORES) {
      for (const product of store.products) {
        const view = demoShowcaseView(store, product);
        expect(view.price).toEqual({
          brlCents: product.priceBrlCents,
          cnyFen: convertBrlCentsToCnyFen(product.priceBrlCents),
        });
        expect(view.contentLang).toBe("zh-Hans");
        expect(view.title).toBe(product.nameZh);
        expect(view.images).toEqual([{ id: product.slug, url: product.image, alt: product.imageAlt }]);
      }
    }
    const prata = findDemoProduct("vale-sereno", "prata")!;
    expect(formatCny(demoShowcaseView(prata.store, prata.product).price!.cnyFen)).toBe("¥79.35");
  });
});

describe("retorno à vitrine real", () => {
  it("aceita só /l/<código> e /p/<código>", () => {
    expect(safeOriginPath("/l/abc123def4")).toBe("/l/abc123def4");
    expect(safeOriginPath("/p/abc123def4")).toBe("/p/abc123def4");
    for (const bad of [null, undefined, "", "//evil.example", "https://evil.example/l/abc123def4", "/l/ABC123DEF4", "/l/abc", "/p/abc123def4/x", "/zh/explorar", "javascript:alert(1)"]) {
      expect(safeOriginPath(bad)).toBeNull();
    }
  });

  it("o link Explorar leva a origem válida e descarta a inválida", () => {
    expect(exploreHref("/l/abc123def4")).toBe("/zh/explorar?de=%2Fl%2Fabc123def4");
    expect(exploreHref("//evil.example")).toBe("/zh/explorar");
    expect(exploreHref()).toBe("/zh/explorar");
  });
});
