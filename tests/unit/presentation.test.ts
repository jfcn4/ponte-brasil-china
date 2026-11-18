/**
 * Versão publicada: fatos e preço vêm do cadastro; a IA só fornece linguagem.
 * A mesma função monta a prévia da revisão e o snapshot publicado (T05).
 */
import { describe, expect, it } from "vitest";
import { buildAdaptationInput } from "@/modules/ai/identity-contract";
import { validTestOutput } from "@/modules/ai/test-adapter";
import { EMPTY_FORM, formToDraft } from "@/modules/products/form";
import {
  PresentationSnapshot,
  SnapshotError,
  buildSnapshot,
  missingForPublication,
  previewSnapshot,
  recommendedChoice,
  snapshotToView,
} from "@/modules/products/presentation";
import { formatCny } from "@/modules/products/pricing";

function setup(overrides: Partial<typeof EMPTY_FORM> = {}) {
  const draft = formToDraft({
    ...EMPTY_FORM,
    name: "Serra Azul Ouro",
    short_description: "Cachaça de alambique.",
    volume_ml: "700",
    abv_percent: "40",
    wood: "amburana",
    producer_name: "Engenho Serra Azul",
    city: "Salinas",
    state: "MG",
    price: "79,00",
    min_order_units: "120",
    availability: "pronta_entrega",
    ...overrides,
  });
  if (!draft.ok) throw new Error(JSON.stringify(draft.errors));
  const output = validTestOutput(buildAdaptationInput(draft.product, draft.store));
  return { product: draft.product, store: draft.store, output };
}

describe("snapshot da versão publicada", () => {
  it("R$ 79,00 → ¥90.85, com a taxa gravada", () => {
    const snap = buildSnapshot({ ...setup(), choice: "equilibrada" });
    expect(PresentationSnapshot.parse(snap)).toEqual(snap);
    expect(snap.price).toEqual({
      brl_cents: 7900,
      cny_fen: 9085,
      from: "BRL",
      to: "CNY",
      rate: "1.15",
      demonstrative: true,
    });
    expect(formatCny(snap.price!.cny_fen)).toBe("¥90.85");
  });

  it.each([
    ["", null],
    ["0", 0],
    ["0,10", 12],
    ["89,00", 10235],
  ])("preço %s → %s fen", (price, fen) => {
    const snap = buildSnapshot({ ...setup({ price }), choice: "fonetica" });
    expect(snap.price?.cny_fen ?? null).toBe(fen);
  });

  it("aplica o nome escolhido com pinyin, ou mantém o original", () => {
    const base = setup();
    const semantic = buildSnapshot({ ...base, choice: "semantica" });
    expect(semantic.name).toMatchObject({ display: "蓝山醇", display_lang: "zh-Hans", pinyin: "Lán Shān Chún", original: "Serra Azul Ouro" });

    const original = buildSnapshot({ ...base, choice: "original" });
    expect(original.name).toMatchObject({ display: "Serra Azul Ouro", display_lang: "pt-BR", pinyin: null });
    expect(original.category_zh).toBe("卡沙萨 · 巴西甘蔗蒸馏酒");
  });

  it("números técnicos e comerciais vêm do cadastro, não da IA", () => {
    const base = setup();
    const tampered = structuredClone(base.output);
    tampered.content.description.zh = "描述";
    const snap = buildSnapshot({ ...base, output: tampered, choice: "equilibrada" });
    expect(snap.facts.attributes.volume_ml).toBe(700);
    expect(snap.facts.attributes.abv_percent).toBe(40);
    expect(snap.facts.min_order_units).toBe(120);
    const view = snapshotToView(snap, [{ id: "a", url: "https://x/y.jpg" }]);
    const facts = Object.fromEntries(view.facts.map((f) => [f.label, f.value]));
    expect(facts).toMatchObject({ 容量: "700 mL", 酒精度: "40% vol", 木桶: "巴西木桶", 起订量: "120 瓶", 供货: "现货" });
  });

  it("exige produtor identificado para publicar, mas a prévia funciona sem ele", () => {
    const base = setup({ producer_name: "" });
    expect(() => buildSnapshot({ ...base, choice: "equilibrada" })).toThrow(SnapshotError);
    expect(previewSnapshot({ ...base, choice: "equilibrada" }).name.display).toBe("山韵");
    expect(missingForPublication({ store: base.store, imageCount: 1 })).toEqual(["producer_name"]);
    expect(missingForPublication({ store: setup().store, imageCount: 0 })).toEqual(["image"]);
  });

  it("vitrine chinesa: preço ausente some, fotos sem URL são omitidas", () => {
    const snap = buildSnapshot({ ...setup({ price: "" }), choice: "equilibrada" });
    const view = snapshotToView(snap, [
      { id: "1", url: "https://x/1.jpg" },
      { id: "2", url: null },
    ]);
    expect(view.price).toBeNull();
    expect(view.images).toHaveLength(1);
    expect(view.contentLang).toBe("zh-Hans");
    expect(view.title).toBe("山韵");
    expect(view.originalName).toBe("Serra Azul Ouro");
  });

  it("recomenda a opção indicada pela IA", () => {
    expect(recommendedChoice(setup().output)).toBe("equilibrada");
  });
});
