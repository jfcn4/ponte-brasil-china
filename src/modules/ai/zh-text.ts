/** Hanzi e pontuação de largura total (、。，：！？“”《》…). */
const WIDE = "\\u3000-\\u303f\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef\\u2018-\\u201d\\u2026";
const GAP_BETWEEN_WIDE = new RegExp(`([${WIDE}])[ \\t\\u00a0]+(?=[${WIDE}])`, "g");

/**
 * Remove espaços soltos entre caracteres chineses ("安布拉纳木 桶" → "安布拉纳木桶")
 * e em volta da pontuação chinesa ("佳酿， 24个月" → "佳酿，24个月"), comuns na saída do modelo. Mantém os espaços junto a letras latinas e números
 * ("Alambique Ipê 家族", "700 mL") e as quebras de linha.
 */
/** Pontuação chinesa de largura total: não leva espaço antes nem depois. */
const SPACE_AROUND_WIDE_PUNCT = /[ \t\u00a0]*([，。、；：！？）」』】])[ \t\u00a0]*|[ \t\u00a0]*([（「『【])/g;

export function tidyZh(text: string): string {
  return text.replace(GAP_BETWEEN_WIDE, "$1").replace(SPACE_AROUND_WIDE_PUNCT, (_, close, open) => close ?? open);
}
