import type { AdapterResult, IdentityAdapter } from "./adapter";
import type { AdaptationInput, IdentityOutput } from "./identity-contract";

export const TEST_MODEL = "test-adapter";

export type TestScenario =
  | "valid"
  | "repeated_strategy"
  | "missing_pinyin"
  | "unsourced_highlight"
  | "provider_error"
  | "timeout";

/**
 * Resposta válida e determinística, construída só a partir da entrada.
 * Os nomes são fixos e não pretendem ser bons: servem a testes reproduzíveis
 * e a ensaios sem cota. A interface identifica quando esta resposta é usada.
 */
export function validTestOutput(input: AdaptationInput): IdentityOutput {
  const hasStory = Boolean(input.story || input.differentiator);
  const a = input.attributes;
  const highlights: IdentityOutput["content"]["highlights"] = [
    { zh: "精选甘蔗，传统蒸馏", pt: "Cana selecionada, destilação tradicional", source_field: "short_description" },
  ];
  if (a.wood) highlights.push({ zh: "木桶储存，风味圆润", pt: "Armazenada em madeira, sabor redondo", source_field: "attributes.wood" });
  if (input.producer.region) highlights.push({ zh: "巴西产区直供", pt: "Direto da região produtora no Brasil", source_field: "producer.region" });

  return {
    options: [
      {
        id: "fon",
        strategy: "fonetica",
        hanzi: "萨拉朵",
        pinyin: "Sà Lā Duǒ",
        meaning: "Caracteres escolhidos pelo som; 朵 lembra uma flor.",
        relation_to_original: `Aproxima a sonoridade de “${input.name}”.`,
        personality_link: "Soa leve e próximo, sem significado forte.",
        rationale: "Prioriza o reconhecimento do nome falado em feiras.",
        aesthetics: "Traços simples e equilibrados.",
        pronunciation: "Fácil para falantes de mandarim.",
        memorability: "Média: o significado é fraco.",
        gains: ["Mantém o som da marca"],
        losses: ["Pouco significado próprio"],
        ambiguities: [],
      },
      {
        id: "sem",
        strategy: "semantica",
        hanzi: "蓝山醇",
        pinyin: "Lán Shān Chún",
        meaning: "蓝 azul, 山 montanha, 醇 bebida encorpada e pura.",
        relation_to_original: "Reinterpreta o significado e a origem do produto.",
        personality_link: "Transmite tradição e pureza.",
        rationale: "Comunica a categoria de bebida destilada de qualidade.",
        aesthetics: "Visual elegante, com o caractere 醇 associado a bebidas.",
        pronunciation: "Tons claros e comuns.",
        memorability: "Alta: imagem concreta de montanha.",
        gains: ["Significado claro para o comprador"],
        losses: ["Perde a sonoridade do original"],
        ambiguities: ["蓝山 também lembra o café Blue Mountain"],
      },
      {
        id: "equ",
        strategy: "equilibrada",
        hanzi: "山韵",
        pinyin: "Shān Yùn",
        meaning: "山 montanha, 韵 encanto, ritmo.",
        relation_to_original: "Combina a imagem de origem com um som curto.",
        personality_link: "Artesanal e refinado.",
        rationale: "Curto, positivo e fácil de lembrar em cartões e QR.",
        aesthetics: "Dois caracteres harmônicos.",
        pronunciation: "Simples, dois tons distintos.",
        memorability: "Alta.",
        gains: ["Curto", "Conotação positiva"],
        losses: ["Não reproduz o som do original"],
        ambiguities: [],
      },
    ],
    recommendation: {
      option_id: "equ",
      reason: "A opção equilibrada é curta, tem conotação positiva e preserva a ideia de origem do produto.",
    },
    content: {
      tagline: { zh: "来自巴西的手工卡沙萨", pt: "Cachaça artesanal do Brasil" },
      description: {
        zh: "以甘蔗为原料的巴西传统蒸馏酒，口感纯正。",
        pt: "Destilado tradicional brasileiro de cana-de-açúcar, de sabor puro.",
      },
      story: hasStory ? { zh: "源自巴西产区的家族酿造传统。", pt: "Tradição familiar de produção em região brasileira." } : null,
      highlights,
    },
    attributes_zh: {
      wood: a.wood ? "巴西木桶" : null,
      aroma: a.aroma ? "香气清新" : null,
      flavor: a.flavor ? "口感顺滑" : null,
    },
  };
}

function invalidOutput(input: AdaptationInput, scenario: TestScenario): unknown {
  const output = validTestOutput(input) as unknown as {
    options: Array<Record<string, unknown>>;
    content: { highlights: Array<Record<string, unknown>> };
  };
  if (scenario === "repeated_strategy") output.options[1]!.strategy = "fonetica";
  if (scenario === "missing_pinyin") delete output.options[0]!.pinyin;
  if (scenario === "unsourced_highlight") {
    // Destaque que cita um campo vazio do cadastro.
    const empty = input.attributes.aging_months === null ? "attributes.aging_months" : "brand";
    output.content.highlights[0] = { zh: "陈酿十二个月", pt: "Envelhecida doze meses", source_field: empty };
  }
  return output;
}

/**
 * Adaptador de teste: consome cenários em ordem (depois repete "valid").
 * Ex.: createTestAdapter(["provider_error"]) falha na primeira chamada e
 * acerta na tentativa seguinte.
 */
export function createTestAdapter(scenarios: TestScenario[] = [], options: { delayMs?: number } = {}): IdentityAdapter & {
  calls: number;
} {
  const queue = [...scenarios];
  const adapter = {
    model: TEST_MODEL,
    calls: 0,
    async generateIdentity(input: AdaptationInput): Promise<AdapterResult> {
      adapter.calls += 1;
      if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      const scenario = queue.shift() ?? "valid";
      if (scenario === "provider_error") return { kind: "error", code: "provider_error", detail: "test_provider_error" };
      if (scenario === "timeout") return { kind: "error", code: "timeout", detail: "test_timeout" };
      if (scenario === "valid") return { kind: "ok", raw: structuredClone(validTestOutput(input)) };
      return { kind: "ok", raw: invalidOutput(input, scenario) };
    },
  };
  return adapter;
}
