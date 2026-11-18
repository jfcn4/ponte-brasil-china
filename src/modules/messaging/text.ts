/**
 * Regras determinísticas de texto usadas pelos contratos de mensagens:
 * idioma pela escrita, preservação de números e alertas de negativa e
 * condicional. Não dependem da IA e rodam no servidor e nos testes.
 */

const CJK = /[㐀-䶿一-鿿豈-﫿]/g;
const LATIN = /[A-Za-zÀ-ÿ]/g;

function count(text: string, pattern: RegExp) {
  return text.match(pattern)?.length ?? 0;
}

export type ScriptLang = "zh-Hans" | "latin" | "other";

/** Escrita predominante: hanzi, alfabeto latino ou indefinida. */
export function detectScript(text: string): ScriptLang {
  const cjk = count(text, CJK);
  const latin = count(text, LATIN);
  if (cjk >= 1 && cjk >= latin * 0.5) return "zh-Hans";
  if (latin >= 2) return "latin";
  return "other";
}

export type ReplyLang = "zh-Hans" | "en";

/**
 * Idioma de toda resposta ao comprador: chinês simplificado, qualquer que seja
 * o idioma em que ele escreveu (inglês, pinyin…). Decisão de 18/11/2026; o
 * inglês segue aceito na entrada e no contrato, mas não é usado na saída.
 */
export const REPLY_LANG: ReplyLang = "zh-Hans";

/** Idioma provisório da entrada até a interpretação confirmar. */
export function provisionalBodyLang(text: string): "zh-Hans" | "en" | "other" {
  const script = detectScript(text);
  if (script === "zh-Hans") return "zh-Hans";
  if (script === "latin") return "en";
  return "other";
}

export function isMostlyChinese(text: string): boolean {
  return detectScript(text) === "zh-Hans" && count(text, CJK) >= 2;
}

export function isMostlyLatin(text: string): boolean {
  return count(text, LATIN) >= 2 && count(text, CJK) <= count(text, LATIN) * 0.2;
}

// ---------------------------------------------------------------------------
// Números
// ---------------------------------------------------------------------------

/** Estilo de separadores: português usa ponto de milhar e vírgula decimal. */
export type NumberStyle = "pt" | "intl";

function normalize(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

/** Números escritos com algarismos ("500", "1.000", "1,000", "0,5", "40%"). */
export function arabicNumbers(text: string, style: NumberStyle): Set<string> {
  const found = new Set<string>();
  const pattern = /\d+(?:[.,]\d+)*/g;
  for (const match of text.matchAll(pattern)) {
    let token = match[0];
    if (style === "pt") {
      // 1.000 / 1.000,50 → milhar com ponto; 0,5 → decimal com vírgula.
      if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(token)) token = token.replace(/\./g, "").replace(",", ".");
      else token = token.replace(",", ".");
    } else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(token)) {
      token = token.replace(/,/g, "");
    } else {
      token = token.replace(",", ".");
    }
    const value = Number(token);
    if (Number.isFinite(value)) found.add(normalize(value));
  }
  return found;
}

const ZH_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const ZH_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
const ZH_BIG: Record<string, number> = { 万: 10_000, 亿: 100_000_000 };

/** Valor de um numeral chinês como 五百, 十二, 两千五百, 1万. */
export function parseChineseNumeral(token: string): number | null {
  let total = 0;
  let section = 0;
  let digit: number | null = null;
  for (const char of token) {
    if (char in ZH_DIGITS) {
      digit = ZH_DIGITS[char]!;
    } else if (char in ZH_UNITS) {
      section += (digit ?? 1) * ZH_UNITS[char]!;
      digit = null;
    } else if (char in ZH_BIG) {
      total += (section + (digit ?? 0)) * ZH_BIG[char]!;
      section = 0;
      digit = null;
    } else {
      return null;
    }
  }
  return total + section + (digit ?? 0);
}

/** Números escritos com numerais chineses, inclusive mistos ("5万"). */
export function chineseNumbers(text: string): Set<string> {
  const found = new Set<string>();
  for (const match of text.matchAll(/(\d+)?([零〇一二两三四五六七八九十百千万亿]+)/g)) {
    const [, arabic, numeral] = match;
    if (arabic && /^[万亿]$/.test(numeral!)) {
      found.add(normalize(Number(arabic) * ZH_BIG[numeral!]!));
      continue;
    }
    const value = parseChineseNumeral(numeral!);
    if (value !== null) found.add(normalize(value));
  }
  return found;
}

const WORD_NUMBERS: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
  dez: 10, cem: 100, cento: 100, mil: 1000, meia: 0.5, meio: 0.5,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  hundred: 100, thousand: 1000, half: 0.5, dozen: 12,
  // Meses: em chinês são números (一月, 1月).
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8,
  setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9,
  october: 10, november: 11, december: 12,
};

// Sílabas de numerais em pinyin, sem tons (yi ambíguo: tratado como 一).
const PINYIN_NUMERALS: Record<string, string> = {
  ling: "零", yi: "一", er: "二", liang: "两", san: "三", si: "四", wu: "五", liu: "六", qi: "七",
  ba: "八", jiu: "九", shi: "十", bai: "百", qian: "千", wan: "万",
};
const PINYIN_SYLLABLES = Object.keys(PINYIN_NUMERALS).sort((a, b) => b.length - a.length);

/** "wubai" → "五百"; null se a palavra não é feita só de sílabas numerais. */
function pinyinWordToHanzi(word: string): string | null {
  let rest = word;
  let hanzi = "";
  while (rest) {
    const syllable = PINYIN_SYLLABLES.find((s) => rest.startsWith(s));
    if (!syllable) return null;
    hanzi += PINYIN_NUMERALS[syllable];
    rest = rest.slice(syllable.length);
  }
  return hanzi || null;
}

/** Numerais em pinyin, inclusive separados ("wu bai", "liang qian"). Só ampliam o que é aceito. */
export function pinyinNumbers(text: string): Set<string> {
  const found = new Set<string>();
  const words = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().match(/[a-z]+/g) ?? [];
  let run = "";
  const flush = () => {
    const value = run ? parseChineseNumeral(run) : null;
    if (value !== null) found.add(normalize(value));
    run = "";
  };
  for (const word of words) {
    const hanzi = pinyinWordToHanzi(word);
    if (hanzi) {
      run += hanzi;
      // Cada palavra também vale sozinha (evita juntar números vizinhos por engano).
      const alone = parseChineseNumeral(hanzi);
      if (alone !== null) found.add(normalize(alone));
    } else flush();
  }
  flush();
  return found;
}

function wordNumbers(text: string): Set<string> {
  const found = new Set<string>(pinyinNumbers(text));
  for (const word of text.toLowerCase().match(/[a-zà-ÿ]+/g) ?? []) {
    if (word in WORD_NUMBERS) found.add(normalize(WORD_NUMBERS[word]!));
  }
  return found;
}

/** Todos os números que um texto expressa, em qualquer forma reconhecida. */
function expressedNumbers(text: string, style: NumberStyle): Set<string> {
  return new Set([...arabicNumbers(text, style), ...chineseNumbers(text), ...wordNumbers(text)]);
}

/**
 * Confere que a tradução preserva os números do original:
 * - todo número em algarismos do original aparece na tradução (em algarismos,
 *   numerais chineses ou por extenso, inclusive nomes de meses);
 * - a tradução não introduz algarismos que o original não expressa.
 * Numerais por extenso nunca são exigidos, só aceitos (evita falso positivo
 * com expressões como 一些 ou "uma").
 */
export function checkNumbers(
  source: { text: string; style: NumberStyle },
  target: { text: string; style: NumberStyle },
): { ok: true } | { ok: false; missing: string[]; added: string[] } {
  const required = arabicNumbers(source.text, source.style);
  const allowed = expressedNumbers(source.text, source.style);
  const targetArabic = arabicNumbers(target.text, target.style);
  const targetAll = new Set([...targetArabic, ...chineseNumbers(target.text), ...wordNumbers(target.text)]);
  const missing = [...required].filter((n) => !targetAll.has(n));
  const added = [...targetArabic].filter((n) => !allowed.has(n));
  return missing.length === 0 && added.length === 0 ? { ok: true } : { ok: false, missing, added };
}

// ---------------------------------------------------------------------------
// Negativas e condicionais
// ---------------------------------------------------------------------------

const PT_NEGATION = /\b(não|nao|nunca|nenhum|nenhuma|nem|sem|jamais)\b/i;
const PT_CONDITION = /\b(se|caso|desde que|contanto que|a menos que|exceto se)\b/i;
const ZH_NEGATION = /[不没無无未非别勿否]/;
// "se" também significa "se/whether" (是否, 能否), não só condição.
const ZH_CONDITION = /(如果|若|假如|的话|只要|一旦|要是|除非|倘若|如|是否|能否|可否)/;
const EN_NEGATION = /\b(not|no|never|none|nor|without|cannot|can't|won't|don't|doesn't|isn't|aren't|unable)\b|n't\b/i;
const EN_CONDITION = /\b(if|unless|provided|as long as|in case|once|whether)\b/i;

/**
 * Alertas para a revisão humana: o português tem negativa ou condicional e a
 * tradução não mostra marca equivalente. Não bloqueiam o envio.
 */
export function meaningWarnings(pt: string, translation: string, lang: ReplyLang): string[] {
  const warnings: string[] = [];
  const negation = lang === "zh-Hans" ? ZH_NEGATION : EN_NEGATION;
  const condition = lang === "zh-Hans" ? ZH_CONDITION : EN_CONDITION;
  if (PT_NEGATION.test(pt) && !negation.test(translation)) {
    warnings.push("O texto em português tem uma negativa. Confira se a tradução mantém o “não”.");
  }
  if (PT_CONDITION.test(pt) && !condition.test(translation)) {
    warnings.push("O texto em português tem uma condição (“se”, “caso”). Confira se a tradução a mantém.");
  }
  return warnings;
}
