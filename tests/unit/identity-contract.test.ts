/**
 * T03 · Contrato da operação 1: só a resposta válida libera a revisão.
 * Usa o adaptador de teste (respostas determinísticas, sem cota).
 */
import { describe, expect, it } from "vitest";
import {
  buildAdaptationInput,
  canonicalJson,
  identityResponseSchema,
  validateIdentityOutput,
  type AdaptationInput,
} from "@/modules/ai/identity-contract";
import { createTestAdapter, validTestOutput } from "@/modules/ai/test-adapter";
import { EMPTY_FORM, formToDraft } from "@/modules/products/form";

function inputFrom(overrides: Partial<typeof EMPTY_FORM> = {}): AdaptationInput {
  const draft = formToDraft({
    ...EMPTY_FORM,
    name: "Serra Azul Ouro",
    short_description: "Cachaça de alambique envelhecida em amburana.",
    volume_ml: "700",
    abv_percent: "40",
    wood: "amburana",
    aging_months: "12",
    personality: ["artesanal", "tradicional"],
    producer_name: "Engenho Serra Azul",
    city: "Salinas",
    state: "MG",
    region: "Norte de Minas",
    story: "Produção familiar desde 1987.",
    price: "79,00",
    ...overrides,
  });
  if (!draft.ok) throw new Error(JSON.stringify(draft.errors));
  return buildAdaptationInput(draft.product, draft.store);
}

describe("entrada da IA", () => {
  it("leva só a fonte descritiva: preço, pedido mínimo e observações ficam de fora", () => {
    const input = inputFrom({ min_order_units: "100", notes: "margem interna" });
    const text = canonicalJson(input);
    expect(text).not.toContain("7900");
    expect(text).not.toContain("price");
    expect(text).not.toContain("margem interna");
    expect(text).not.toContain("min_order");
    expect(input.personality).toEqual(["Artesanal", "Tradicional"]);
  });

  it("JSON canônico independe da ordem das chaves", () => {
    expect(canonicalJson({ b: 1, a: { d: null, c: [2, 1] } })).toBe(canonicalJson({ a: { c: [2, 1], d: null }, b: 1 }));
  });
});

describe("validação da saída (T03)", () => {
  const input = inputFrom();

  it("aceita três estratégias válidas com recomendação justificada", () => {
    const result = validateIdentityOutput(validTestOutput(input), input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.options.map((o) => o.strategy).sort()).toEqual(["equilibrada", "fonetica", "semantica"]);
    expect(result.output.recommendation.reason.length).toBeGreaterThan(20);
  });

  it("recusa estratégia repetida", async () => {
    const adapter = createTestAdapter(["repeated_strategy"]);
    const raw = await adapter.generateIdentity(input, 1);
    expect(raw.kind).toBe("ok");
    const result = validateIdentityOutput(raw.kind === "ok" ? raw.raw : null, input);
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.issues.join(" ")).toContain("estratégia repetida");
  });

  it("recusa opção sem pinyin", async () => {
    const raw = await createTestAdapter(["missing_pinyin"]).generateIdentity(input, 1);
    const result = validateIdentityOutput(raw.kind === "ok" ? raw.raw : null, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toContain("pinyin");
  });

  it("recusa destaque cujo campo de origem está vazio no cadastro", async () => {
    const noAging = inputFrom({ aging_months: "" });
    const raw = await createTestAdapter(["unsourced_highlight"]).generateIdentity(noAging, 1);
    const result = validateIdentityOutput(raw.kind === "ok" ? raw.raw : null, noAging);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toContain("attributes.aging_months");
  });

  it("recusa destaque sem campo de origem", () => {
    const output = structuredClone(validTestOutput(input)) as unknown as { content: { highlights: Array<Record<string, unknown>> } };
    delete output.content.highlights[0]!.source_field;
    expect(validateIdentityOutput(output, input).ok).toBe(false);
  });

  it("recusa recomendação que aponta para opção inexistente", () => {
    const output = structuredClone(validTestOutput(input));
    output.recommendation.option_id = "xyz";
    expect(validateIdentityOutput(output, input).ok).toBe(false);
  });

  it("recusa texto chinês escrito em outro idioma", () => {
    const output = structuredClone(validTestOutput(input));
    output.content.tagline.zh = "Artisanal cachaça from Brazil";
    const result = validateIdentityOutput(output, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toContain("content.tagline.zh");
  });

  it("recusa história inventada quando o cadastro não tem história nem diferencial", () => {
    const bare = inputFrom({ story: "", differentiator: "" });
    const output = structuredClone(validTestOutput(input));
    expect(output.content.story).not.toBeNull();
    const result = validateIdentityOutput(output, bare);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toContain("content.story");
  });

  it("recusa números que não existem no cadastro (preço, prazo, volume inventado)", () => {
    const output = structuredClone(validTestOutput(input));
    output.content.description.zh = "每瓶仅售 90.85 元，750 毫升装。";
    const result = validateIdentityOutput(output, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toMatch(/90\.85|750/);
  });

  it("apresentação da loja: aceita saída v1 sem ela, recusa número inventado ou texto fora do chinês", () => {
    const legacy = structuredClone(validTestOutput(input)) as Record<string, unknown>;
    delete legacy.store_intro;
    expect(validateIdentityOutput(legacy, input).ok).toBe(true);

    const invented = structuredClone(validTestOutput(input));
    invented.store_intro = { zh: "创立于 1960 年的家族酒厂。", pt: "Engenho familiar fundado em 1960." };
    const result = validateIdentityOutput(invented, input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.join(" ")).toContain("1960");

    const english = structuredClone(validTestOutput(input));
    english.store_intro = { zh: "Family distillery from Brazil", pt: "Engenho familiar do Brasil" };
    expect(validateIdentityOutput(english, input).ok).toBe(false);
  });

  it("o esquema enviado ao provedor exige store_intro (pode ser null)", () => {
    const schema = identityResponseSchema() as { required?: string[]; properties?: Record<string, unknown> };
    expect(schema.required).toContain("store_intro");
    expect(schema.properties).toHaveProperty("store_intro");
  });

  it("aceita números do cadastro com a mesma unidade", () => {
    const output = structuredClone(validTestOutput(input));
    output.content.description.zh = "700 毫升，40% 酒精度，木桶陈酿 12 个月，始于 1987 年。";
    expect(validateIdentityOutput(output, input).ok).toBe(true);
  });

  it("exige tradução dos atributos presentes e descarta tradução sem fonte", () => {
    const missing = structuredClone(validTestOutput(input));
    missing.attributes_zh.wood = null;
    expect(validateIdentityOutput(missing, input).ok).toBe(false);

    // Aroma citado só na descrição: a tradução extra some, a geração continua válida.
    const extra = structuredClone(validTestOutput(input));
    extra.attributes_zh.aroma = "香草";
    const checked = validateIdentityOutput(extra, input);
    expect(checked.ok).toBe(true);
    if (checked.ok) expect(checked.output.attributes_zh.aroma).toBeNull();
  });

  it("recusa JSON malformado ou vazio", () => {
    expect(validateIdentityOutput({ malformed: true }, input).ok).toBe(false);
    expect(validateIdentityOutput(null, input).ok).toBe(false);
  });
});

describe("adaptador de teste", () => {
  it("consome cenários em ordem e depois responde válido", async () => {
    const input = inputFrom();
    const adapter = createTestAdapter(["provider_error", "timeout"]);
    expect(await adapter.generateIdentity(input, 1)).toMatchObject({ kind: "error", code: "provider_error" });
    expect(await adapter.generateIdentity(input, 1)).toMatchObject({ kind: "error", code: "timeout" });
    const third = await adapter.generateIdentity(input, 1);
    expect(third.kind).toBe("ok");
    expect(adapter.calls).toBe(3);
  });

  it("gera resposta válida também para cadastro mínimo (nome, descrição)", async () => {
    const minimal = inputFrom({
      volume_ml: "",
      abv_percent: "",
      wood: "",
      aging_months: "",
      story: "",
      region: "",
      city: "",
      state: "",
      producer_name: "",
      personality: [],
    });
    const raw = await createTestAdapter().generateIdentity(minimal, 1);
    expect(validateIdentityOutput(raw.kind === "ok" ? raw.raw : null, minimal).ok).toBe(true);
  });
});

describe("esquema enviado ao provedor", () => {
  it("é JSON Schema sem padrões regex nem $schema", () => {
    const schema = identityResponseSchema();
    const text = JSON.stringify(schema);
    expect(text).not.toContain('"pattern"');
    expect(text).not.toContain("$schema");
    expect(schema).toMatchObject({ type: "object", required: expect.arrayContaining(["options", "content"]) });
  });
});
