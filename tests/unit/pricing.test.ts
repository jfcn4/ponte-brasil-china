import { describe, expect, it } from "vitest";
import {
  DEMO_EXCHANGE_RATE,
  centsToBrlInput,
  convertBrlCentsToCnyFen,
  formatBrl,
  formatBrlForBuyer,
  formatCny,
  parseBrlInput,
} from "@/modules/products/pricing";

describe("câmbio demonstrativo BRL 1 = CNY 1,15 (T05)", () => {
  it("mantém o preço ausente como ausente", () => {
    expect(convertBrlCentsToCnyFen(null)).toBeNull();
  });

  it.each([
    [0, 0, "¥0.00"],
    [10, 12, "¥0.12"], // 11,5 fen arredonda para cima
    [7900, 9085, "¥90.85"],
    [8900, 10235, "¥102.35"],
    [1, 1, "¥0.01"], // 1,15 fen
    [3, 3, "¥0.03"], // 3,45 fen
    [100_000_000, 115_000_000, "¥1,150,000.00"],
  ])("R$ %i centavos → %i fen (%s)", (cents, fen, label) => {
    expect(convertBrlCentsToCnyFen(cents)).toBe(fen);
    expect(formatCny(fen)).toBe(label);
  });

  it("recusa valores não inteiros, negativos ou acima do limite", () => {
    expect(() => convertBrlCentsToCnyFen(10.5)).toThrow(RangeError);
    expect(() => convertBrlCentsToCnyFen(-1)).toThrow(RangeError);
    expect(() => convertBrlCentsToCnyFen(100_000_001)).toThrow(RangeError);
  });

  it("expõe a taxa em forma exata para o snapshot", () => {
    expect(DEMO_EXCHANGE_RATE).toMatchObject({ from: "BRL", to: "CNY", rate: "1.15", rateHundredths: 115 });
  });
});

describe("formatação", () => {
  it("formata BRL para o produtor e para o comprador", () => {
    expect(formatBrl(7900)).toBe("R$ 79,00");
    expect(formatBrl(123456)).toBe("R$ 1.234,56");
    expect(formatBrlForBuyer(7900)).toBe("BRL 79.00");
    expect(formatBrlForBuyer(123456)).toBe("BRL 1,234.56");
  });
});

describe("leitura do preço digitado", () => {
  it.each([
    ["", null],
    ["   ", null],
    ["0", 0],
    ["0,10", 10],
    ["0,1", 10],
    ["79", 7900],
    ["79,00", 7900],
    ["R$ 89,00", 8900],
    ["1.234,56", 123456],
    ["1234,56", 123456],
  ])("%j → %j centavos", (input, cents) => {
    expect(parseBrlInput(input)).toEqual({ ok: true, cents });
  });

  it.each(["abc", "79,001", "-5", "79.00", "1.23,45", "79,", "1000000,01"])("recusa %j", (input) => {
    expect(parseBrlInput(input).ok).toBe(false);
  });

  it("volta ao formato do campo", () => {
    expect(centsToBrlInput(null)).toBe("");
    expect(centsToBrlInput(7900)).toBe("79,00");
    expect(centsToBrlInput(10)).toBe("0,10");
    expect(parseBrlInput(centsToBrlInput(123456))).toEqual({ ok: true, cents: 123456 });
  });
});
