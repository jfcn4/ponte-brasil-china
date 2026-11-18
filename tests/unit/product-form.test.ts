import { describe, expect, it } from "vitest";
import { EMPTY_FORM, draftToForm, formToDraft } from "@/modules/products/form";
import { ProductDraft, SaveDraftRequest, StoreOrigin, missingForGeneration } from "@/modules/products/schema";
import { buildDraftPreview } from "@/modules/products/showcase";

describe("formulário → rascunho", () => {
  it("aceita rascunho totalmente vazio (T02: salvar incompleto)", () => {
    const result = formToDraft(EMPTY_FORM);
    expect(result.ok).toBe(true);
    expect(result.product.name).toBeNull();
    expect(result.product.price_brl_cents).toBeNull();
    expect(result.product.attributes.volume_ml).toBeNull();
    expect(SaveDraftRequest.safeParse({ expectedRevision: null, product: result.product, store: result.store }).success).toBe(true);
  });

  it("converte unidades preservando valores", () => {
    const result = formToDraft({
      ...EMPTY_FORM,
      name: "  Serra Azul  ",
      volume_ml: "700",
      abv_percent: "40,5",
      aging_months: "24",
      price: "79,00",
      min_order_units: "100",
      state: "MG",
      personality: ["artesanal", "tradicional"],
    });
    expect(result.ok).toBe(true);
    expect(result.product).toMatchObject({
      name: "Serra Azul",
      price_brl_cents: 7900,
      min_order_units: 100,
      personality: ["artesanal", "tradicional"],
      attributes: { volume_ml: 700, abv_percent: 40.5, aging_months: 24 },
    });
    expect(result.store.state).toBe("MG");
  });

  it("aponta o erro no próprio campo e mantém o restante para a prévia", () => {
    const result = formToDraft({ ...EMPTY_FORM, name: "Serra Azul", abv_percent: "40,55", price: "abc", volume_ml: "20" });
    expect(result.ok).toBe(false);
    expect(Object.keys(result.errors).sort()).toEqual(["abv_percent", "price", "volume_ml"]);
    expect(result.product.name).toBe("Serra Azul");
    expect(result.product.price_brl_cents).toBeNull();
  });

  it("limita a personalidade a duas características", () => {
    const result = formToDraft({ ...EMPTY_FORM, personality: ["artesanal", "premium", "familiar"] });
    expect(result.ok).toBe(false);
    expect(result.errors.personality).toBeDefined();
  });

  it("ida e volta preserva os dados", () => {
    const form = {
      ...EMPTY_FORM,
      name: "Serra Azul",
      abv_percent: "40,5",
      price: "0,10",
      type: "envelhecida",
      availability: "sob_encomenda",
      city: "Salinas",
      state: "MG",
    };
    const result = formToDraft(form);
    expect(draftToForm(result.product, result.store)).toEqual(form);
  });
});

describe("esquemas de fronteira", () => {
  it("recusa campos desconhecidos e valores fora do contrato", () => {
    const base = formToDraft(EMPTY_FORM).product;
    expect(ProductDraft.safeParse({ ...base, status: "published" }).success).toBe(false);
    expect(ProductDraft.safeParse({ ...base, price_brl_cents: 79.5 }).success).toBe(false);
    expect(ProductDraft.safeParse({ ...base, personality: ["artesanal", "artesanal"] }).success).toBe(false);
    expect(ProductDraft.safeParse({ ...base, attributes: { ...base.attributes, abv_percent: 40.55 } }).success).toBe(false);
    expect(StoreOrigin.safeParse({ producer_name: null, city: null, state: "XX", region: null }).success).toBe(false);
  });

  it("nome, descrição e uma foto liberam a geração", () => {
    expect(missingForGeneration({ name: null, short_description: " ", imageCount: 0 })).toEqual([
      "name",
      "short_description",
      "image",
    ]);
    expect(missingForGeneration({ name: "Serra Azul", short_description: "Cachaça de alambique.", imageCount: 1 })).toEqual([]);
  });
});

describe("prévia da vitrine", () => {
  it("usa a conversão central e omite campos vazios", () => {
    const { product, store } = formToDraft({ ...EMPTY_FORM, name: "Serra Azul", price: "79,00", volume_ml: "700" });
    const view = buildDraftPreview(product, store, [{ id: "a", url: "https://x/1.jpg" }, { id: "b", url: null }]);
    expect(view.price).toEqual({ cnyFen: 9085, brlCents: 7900 });
    expect(view.facts).toEqual([{ label: "容量", value: "700 mL" }]);
    expect(view.images).toHaveLength(1);
    expect(view.story).toBeNull();
    expect(view.origin).toBeNull();
  });

  it("sem preço não mostra valores", () => {
    const { product, store } = formToDraft({ ...EMPTY_FORM, name: "Serra Azul" });
    expect(buildDraftPreview(product, store, []).price).toBeNull();
  });
});
