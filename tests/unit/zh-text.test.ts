import { describe, expect, it } from "vitest";
import { identityResponseSchema } from "@/modules/ai/identity-contract";
import { tidyZh } from "@/modules/ai/zh-text";

describe("tidyZh", () => {
  it("remove espaços soltos entre hanzi e pontuação chinesa", () => {
    expect(tidyZh("这款酒在安布拉纳木 桶中陈年，带有香草的芬 芳 。")).toBe("这款酒在安布拉纳木桶中陈年，带有香草的芬芳。");
  });

  it("tira espaços em volta da pontuação chinesa, inclusive antes de números", () => {
    expect(tidyZh("源自萨利纳斯的手工珍酿， 24个月陈酿 。（限量）")).toBe("源自萨利纳斯的手工珍酿，24个月陈酿。（限量）");
  });

  it("mantém espaços junto a nomes latinos, números e unidades, e as quebras de linha", () => {
    const text = "来自 Alambique Ipê 的家族酒厂。\n每瓶 700 mL，40% vol。";
    expect(tidyZh(text)).toBe(text);
  });

  it("o contrato enviado ao provedor continua representável em JSON Schema", () => {
    expect(() => identityResponseSchema()).not.toThrow();
  });
});
