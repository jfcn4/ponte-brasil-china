/**
 * Contratos das operações 2 e 3 e regras determinísticas de texto: idioma,
 * preservação de números (T07, T08), fatos citados só quando existem na
 * versão consultada e pendências de quantidade e frete.
 */
import { describe, expect, it } from "vitest";
import {
  pendingFor,
  reviewWarnings,
  validateInterpretOutput,
  validateTranslateOutput,
  type InterpretInput,
  type InterpretOutput,
  type TranslateInput,
} from "@/modules/ai/messaging-contract";
import { createTestMessagingAdapter, validTestInterpretation, validTestTranslation } from "@/modules/ai/test-adapter";
import {
  arabicNumbers,
  checkNumbers,
  chineseNumbers,
  detectScript,
  meaningWarnings,
  parseChineseNumeral,
  replyLangFor,
} from "@/modules/messaging/text";

const SHANGHAI = "您好！请问你们能供应500瓶吗？可以送到上海吗？";

const input = (overrides: Partial<InterpretInput> = {}): InterpretInput => ({
  message: SHANGHAI,
  history: [],
  product: { name: "蓝山醇", original_name: "Cachaça Serra Azul", facts: { volume_ml: "700 mL por garrafa" } },
  ...overrides,
});

/** Saída como o Gemini deveria devolver para a pergunta de Xangai. */
const goodInterpretation = (): InterpretOutput => ({
  language: "zh-Hans",
  translation_pt: "Olá! Vocês conseguem fornecer 500 garrafas? Podem entregar em Xangai?",
  summary_pt: "O comprador quer saber se há 500 garrafas e se a entrega pode ser feita em Xangai.",
  intents: ["quantity", "delivery"],
  quantities: [{ value: 500, unit_pt: "garrafas", source_text: "500瓶" }],
  available_facts: ["volume_ml"],
  missing: [],
  next_step_pt: "Verificar estoque e cotar o frete até Xangai.",
  suggested_reply_pt: "Obrigado pelo contato! Cada garrafa tem 700 mL; vou confirmar a disponibilidade e o frete até Xangai.",
  cultural_note_pt: null,
});

describe("idioma pela escrita", () => {
  it("chinês, inglês e indefinido", () => {
    expect(detectScript(SHANGHAI)).toBe("zh-Hans");
    expect(detectScript("Can you ship 500 bottles to Shanghai?")).toBe("latin");
    expect(detectScript("500?")).toBe("other");
    expect(replyLangFor(SHANGHAI)).toBe("zh-Hans");
    expect(replyLangFor("Can you ship 500 bottles to Shanghai?")).toBe("en");
    // Pinyin com hanzi (caso real da simulação) é chinês.
    expect(replyLangFor("nihao, wozaibeijing. woyao卡沙萨")).toBe("zh-Hans");
  });
});

describe("números", () => {
  it("lê separadores em português e no padrão internacional", () => {
    expect([...arabicNumbers("1.000 garrafas de 0,7 L a R$ 79,00", "pt")]).toEqual(["1000", "0.7", "79"]);
    expect([...arabicNumbers("1,000 bottles, 40.5% abv", "intl")]).toEqual(["1000", "40.5"]);
  });

  it("converte numerais chineses", () => {
    expect(parseChineseNumeral("五百")).toBe(500);
    expect(parseChineseNumeral("两千五百")).toBe(2500);
    expect(parseChineseNumeral("十二")).toBe(12);
    expect([...chineseNumbers("需要5万瓶")]).toEqual(["50000"]);
  });

  it("aceita a tradução que preserva números e unidades", () => {
    expect(checkNumbers({ text: SHANGHAI, style: "intl" }, { text: "Vocês fornecem 500 garrafas em Xangai?", style: "pt" })).toEqual({ ok: true });
    expect(checkNumbers({ text: "能供应五百瓶吗", style: "intl" }, { text: "Fornecem 500 garrafas?", style: "pt" })).toEqual({ ok: true });
    expect(checkNumbers({ text: "我们需要一些样品", style: "intl" }, { text: "Precisamos de algumas amostras", style: "pt" })).toEqual({ ok: true });
    // Pinyin puro (caso real: "wubai ping" = 500 garrafas).
    expect(checkNumbers({ text: "wo xiang mai wubai ping", style: "intl" }, { text: "Quero comprar 500 garrafas", style: "pt" })).toEqual({ ok: true });
    expect(checkNumbers({ text: "wo yao liang qian wu bai ping", style: "intl" }, { text: "Quero 2.500 garrafas", style: "pt" })).toEqual({ ok: true });
    expect(checkNumbers({ text: "wo xiang mai wubai ping", style: "intl" }, { text: "Quero comprar 5000 garrafas", style: "pt" })).toMatchObject({ ok: false });
    // Meses viram números em chinês, nos dois sentidos (caso real do Gemini: “1 月前”).
    expect(checkNumbers({ text: "Entregamos 500 garrafas até janeiro.", style: "pt" }, { text: "我们1月前交付500瓶。", style: "intl" })).toEqual({ ok: true });
    expect(checkNumbers({ text: "能在1月前送到上海吗？", style: "intl" }, { text: "Podem entregar em Xangai antes de janeiro?", style: "pt" })).toEqual({ ok: true });
  });

  it("recusa número trocado, omitido ou inventado", () => {
    expect(checkNumbers({ text: SHANGHAI, style: "intl" }, { text: "Fornecem 5000 garrafas?", style: "pt" })).toMatchObject({
      ok: false,
      missing: ["500"],
      added: ["5000"],
    });
    expect(checkNumbers({ text: SHANGHAI, style: "intl" }, { text: "Fornecem garrafas?", style: "pt" })).toMatchObject({ ok: false });
    expect(checkNumbers({ text: "Temos 700 mL", style: "pt" }, { text: "我们有700毫升，30天发货", style: "intl" })).toMatchObject({
      ok: false,
      added: ["30"],
    });
  });
});

describe("operação 2 · interpretar", () => {
  it("aceita a análise fiel e aponta capacidade e frete como pendentes (T07)", () => {
    const result = validateInterpretOutput(goodInterpretation(), input());
    expect(result.ok).toBe(true);
    const pending = pendingFor(goodInterpretation(), { volume_ml: "700 mL por garrafa" }).map((p) => p.topic);
    expect(pending).toEqual(["capacity", "freight"]);
  });

  it("recusa tradução com números alterados", () => {
    const raw = { ...goodInterpretation(), translation_pt: "Vocês fornecem 50 garrafas em Xangai?" };
    const result = validateInterpretOutput(raw, input());
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.issues.join()).toContain("translation_pt");
  });

  it("recusa idioma divergente da escrita", () => {
    const result = validateInterpretOutput({ ...goodInterpretation(), language: "en" }, input());
    expect(result.ok).toBe(false);
  });

  it("aceita chinês escrito em pinyin", () => {
    const pinyin = input({ message: "nihao, wo zai beijing, wo yao mai cachaca" });
    const raw = { ...goodInterpretation(), translation_pt: "Olá, estou em Pequim e quero comprar cachaça.", quantities: [] };
    expect(validateInterpretOutput(raw, pinyin).ok).toBe(true);
  });

  it("recusa fato citado que não existe na versão consultada", () => {
    const result = validateInterpretOutput({ ...goodInterpretation(), available_facts: ["volume_ml", "price"] }, input());
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.issues.join()).toContain("price");
  });

  it("recusa sugestão com número fora da pergunta e da ficha", () => {
    const raw = { ...goodInterpretation(), suggested_reply_pt: "Entregamos em 30 dias, garrafas de 700 mL." };
    expect(validateInterpretOutput(raw, input()).ok).toBe(false);
  });

  it("recusa estrutura incompleta", () => {
    const { suggested_reply_pt: _omit, ...raw } = goodInterpretation();
    void _omit;
    expect(validateInterpretOutput(raw, input()).ok).toBe(false);
  });

  it("a resposta de teste também passa no contrato, em chinês e em inglês", () => {
    expect(validateInterpretOutput(validTestInterpretation(input()), input()).ok).toBe(true);
    const en = input({ message: "Hello, can you ship 500 bottles to Shanghai? What is the price?" });
    const out = validTestInterpretation(en);
    expect(validateInterpretOutput(out, en).ok).toBe(true);
    expect(out.intents).toEqual(expect.arrayContaining(["quantity", "delivery", "price"]));
  });
});

describe("operação 3 · traduzir", () => {
  const zh: TranslateInput = {
    text_pt: "Obrigado! Temos 500 garrafas de 700 mL. Se o frete for por navio, confirmo o prazo.",
    target_lang: "zh-Hans",
    context: { buyer_message: SHANGHAI, product_name: "蓝山醇" },
  };

  it("aceita tradução fiel", () => {
    const raw = { target_lang: "zh-Hans", translation: "谢谢！我们有500瓶700毫升装。如果走海运，我会确认交货时间。", warnings_pt: [] };
    const result = validateTranslateOutput(raw, zh);
    expect(result.ok).toBe(true);
    if (result.ok) expect(reviewWarnings(zh, result.output)).toEqual([]);
  });

  it("recusa idioma errado e números alterados", () => {
    expect(validateTranslateOutput({ target_lang: "en", translation: "Thanks! 500 bottles of 700 mL.", warnings_pt: [] }, zh).ok).toBe(false);
    expect(validateTranslateOutput({ target_lang: "zh-Hans", translation: "Thanks! We have 500 bottles of 700 mL.", warnings_pt: [] }, zh).ok).toBe(false);
    expect(validateTranslateOutput({ target_lang: "zh-Hans", translation: "谢谢！我们有50瓶700毫升装。", warnings_pt: [] }, zh).ok).toBe(false);
  });

  it("alerta quando negativa ou condição somem", () => {
    expect(meaningWarnings("Não fazemos entrega em Xangai.", "我们在上海送货。", "zh-Hans")).toHaveLength(1);
    expect(meaningWarnings("Se o pedido for de 500, enviamos.", "订单500瓶，我们发货。", "zh-Hans")).toHaveLength(1);
    expect(meaningWarnings("Não fazemos entrega.", "We do not deliver.", "en")).toEqual([]);
    // "se" com sentido de "whether" (caso real do Gemini) não gera alerta.
    expect(meaningWarnings("Vou confirmar se conseguimos produzir.", "我将确认我们是否能生产。", "zh-Hans")).toEqual([]);
  });

  it("resposta de teste passa no contrato e adaptador consome cenários", async () => {
    expect(validateTranslateOutput(validTestTranslation(zh), zh).ok).toBe(true);
    const adapter = createTestMessagingAdapter(["provider_error", "invalid_output"]);
    expect(await adapter.translateReply(zh, 1)).toMatchObject({ kind: "error", code: "provider_error" });
    const broken = await adapter.translateReply(zh, 1);
    expect(broken.kind === "ok" && validateTranslateOutput(broken.raw, zh).ok).toBe(false);
    const valid = await adapter.translateReply(zh, 1);
    expect(valid.kind === "ok" && validateTranslateOutput(valid.raw, zh).ok).toBe(true);
    expect(adapter.calls).toBe(3);
  });
});
