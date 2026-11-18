/**
 * Regra única de câmbio demonstrativo: BRL 1 = CNY 1,15.
 *
 * Valores em BRL são centavos inteiros; valores em CNY são fen (centésimos de
 * yuan) inteiros. A conversão usa só inteiros e arredonda meio centavo para
 * cima, a duas casas. Prévia, publicação e vitrine devem chamar esta função.
 */
export const DEMO_EXCHANGE_RATE = {
  from: "BRL",
  to: "CNY",
  /** Taxa em representação decimal exata, para gravar no snapshot publicado. */
  rate: "1.15",
  /** CNY por BRL multiplicado por 100 (1,15 → 115). */
  rateHundredths: 115,
  demonstrative: true,
} as const;

export type ExchangeRateSnapshot = typeof DEMO_EXCHANGE_RATE;

const MAX_CENTS = 100_000_000; // R$ 1.000.000,00

/** Converte centavos de real em fen. Preço ausente permanece ausente. */
export function convertBrlCentsToCnyFen(brlCents: number | null): number | null {
  if (brlCents === null) return null;
  if (!Number.isInteger(brlCents) || brlCents < 0 || brlCents > MAX_CENTS) {
    throw new RangeError("Preço em centavos inválido");
  }
  return Math.floor((brlCents * DEMO_EXCHANGE_RATE.rateHundredths + 50) / 100);
}

function splitMinorUnits(minor: number): { whole: string; fraction: string } {
  const whole = Math.floor(minor / 100);
  const fraction = String(minor % 100).padStart(2, "0");
  return { whole: String(whole), fraction };
}

function groupThousands(whole: string, separator: string): string {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/** "R$ 79,00" — interface do produtor. */
export function formatBrl(cents: number): string {
  const { whole, fraction } = splitMinorUnits(cents);
  return `R$ ${groupThousands(whole, ".")},${fraction}`;
}

/** "BRL 79.00" — referência secundária na interface chinesa. */
export function formatBrlForBuyer(cents: number): string {
  const { whole, fraction } = splitMinorUnits(cents);
  return `BRL ${groupThousands(whole, ",")}.${fraction}`;
}

/** "¥90.85" — interface chinesa. */
export function formatCny(fen: number): string {
  const { whole, fraction } = splitMinorUnits(fen);
  return `¥${groupThousands(whole, ",")}.${fraction}`;
}

/**
 * Lê o preço digitado pelo produtor ("79", "79,9", "79,00", "1.234,56") em
 * centavos, sem passar por ponto flutuante. Vazio significa preço ausente.
 */
export function parseBrlInput(input: string): { ok: true; cents: number | null } | { ok: false } {
  const value = input.trim().replace(/^R\$\s*/i, "");
  if (value === "") return { ok: true, cents: null };

  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(value);
  if (!match) return { ok: false };

  const whole = Number(match[1]!.replace(/\./g, ""));
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return { ok: false };
  return { ok: true, cents };
}

/** Centavos de volta ao formato do campo ("79,00"). */
export function centsToBrlInput(cents: number | null): string {
  if (cents === null) return "";
  const { whole, fraction } = splitMinorUnits(cents);
  return `${whole},${fraction}`;
}
