import { z } from "zod";
import { convertBrlCentsToCnyFen } from "@/modules/products/pricing";
import { CATEGORY_ZH, type ShowcaseView } from "@/modules/products/showcase";
import type { CatalogItem, StoreCatalogView } from "@/modules/stores/catalog-view";

/**
 * Extra "Explorar mais marcas brasileiras": diretório estático de lojas
 * FICTÍCIAS, servido sob /zh/explorar. Não toca no banco, não cria conversa,
 * conta nem transação. Toda página que exibe estes dados mostra DEMO_LABEL.
 * A cachaça é o exemplo principal; café e mel são apenas exemplos visuais.
 */

export const DEMO_LABEL = "虚构品牌 · 演示";
export const DEMO_INQUIRY_UNAVAILABLE = "这是虚构品牌的演示页面，无法发起询价。真实店铺可正常询价。";
export const EXPLORE_TITLE = "探索更多巴西品牌";

const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const DemoProduct = z
  .object({
    slug: Slug,
    nameZh: z.string().min(1),
    pinyin: z.string().min(1),
    namePt: z.string().min(1),
    tagline: z.string().min(1),
    description: z.string().min(1),
    highlights: z.array(z.string().min(1)).max(3),
    facts: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) }).strict()),
    story: z.string().min(1),
    /** Preço de referência em centavos de real; o yuan sai da regra única de câmbio. */
    priceBrlCents: z.number().int().nonnegative(),
    /** Ilustração estática em /public/explorar. */
    image: z.string().regex(/^\/explorar\/[a-z0-9-]+\.svg$/),
    imageAlt: z.string().min(1),
  })
  .strict();

const DemoStore = z
  .object({
    slug: Slug,
    name: z.string().min(1),
    kind: z.enum(["cachaca", "cafe", "mel"]),
    /** Linha acima do nome da loja, ex. "巴西卡沙萨生产者". */
    kicker: z.string().min(1),
    /** Categoria exibida em cada produto. */
    category: z.string().min(1),
    origin: z.string().min(1),
    intro: z.string().min(1),
    products: z.array(DemoProduct).min(1),
  })
  .strict();

export type DemoProduct = z.infer<typeof DemoProduct>;
export type DemoStore = z.infer<typeof DemoStore>;

const STORES_DATA: DemoStore[] = [
  {
    slug: "vale-sereno",
    name: "Alambique Vale Sereno",
    kind: "cachaca",
    kicker: "巴西卡沙萨生产者",
    category: CATEGORY_ZH,
    origin: "Salinas, Minas Gerais · Sudeste",
    intro: "来自米纳斯吉拉斯州萨利纳斯的小型家庭酒坊，以铜壶蒸馏手工卡沙萨，兼顾清爽的银色款与木桶陈酿款。",
    products: [
      {
        slug: "prata",
        nameZh: "静谷·银",
        pinyin: "Jìng Gǔ · Yín",
        namePt: "Vale Sereno Prata",
        tagline: "未经木桶陈酿，保留新鲜甘蔗的清爽香气。",
        description: "铜壶蒸馏后在不锈钢罐中静置六个月，口感干净，适合调制鸡尾酒或冰镇纯饮。",
        highlights: ["铜壶小批量蒸馏", "不经木桶，突出甘蔗本味", "适合调酒与纯饮"],
        facts: [
          { label: "类型", value: "银色（未陈酿）" },
          { label: "容量", value: "700 mL" },
          { label: "酒精度", value: "40% vol" },
          { label: "香气", value: "新鲜甘蔗、青草" },
          { label: "起订量", value: "120 瓶" },
          { label: "供货", value: "现货" },
        ],
        story: "酒坊位于萨利纳斯山谷，甘蔗当天收割、当天压榨。第二代酿酒师坚持只取蒸馏的“酒心”部分。",
        priceBrlCents: 6900,
        image: "/explorar/cachaca-prata.svg",
        imageAlt: "静谷·银 卡沙萨示意图",
      },
      {
        slug: "amburana",
        nameZh: "静谷·琥珀",
        pinyin: "Jìng Gǔ · Hǔpò",
        namePt: "Vale Sereno Amburana 2 anos",
        tagline: "安布拉纳木桶陈酿两年，带有肉桂与香草的温暖气息。",
        description: "巴西本土木材安布拉纳赋予酒体柔和的甜香与琥珀色泽，适合餐后慢饮。",
        highlights: ["安布拉纳木桶陈酿 24 个月", "肉桂、香草与烤坚果香气", "限量编号装瓶"],
        facts: [
          { label: "类型", value: "陈酿" },
          { label: "容量", value: "700 mL" },
          { label: "酒精度", value: "42% vol" },
          { label: "木桶", value: "安布拉纳木" },
          { label: "陈酿", value: "24 个月" },
          { label: "香气", value: "肉桂、香草、烤坚果" },
          { label: "起订量", value: "60 瓶" },
          { label: "供货", value: "限量生产" },
        ],
        story: "每批只装满二十只木桶。酿酒师每季品鉴一次，确认风味平衡后才装瓶。",
        priceBrlCents: 12900,
        image: "/explorar/cachaca-amburana.svg",
        imageAlt: "静谷·琥珀 卡沙萨示意图",
      },
    ],
  },
  {
    slug: "bruma-alta",
    name: "Café Bruma Alta",
    kind: "cafe",
    kicker: "巴西精品咖啡生产者",
    category: "精品咖啡 · 巴西阿拉比卡",
    origin: "Iúna, Espírito Santo · Sudeste",
    intro: "卡帕拉奥山区的家庭咖啡园，海拔一千米以上，手工采摘成熟咖啡果。本店仅作为浏览示例。",
    products: [
      {
        slug: "catuai-amarelo",
        nameZh: "雾峰·黄卡杜艾",
        pinyin: "Wù Fēng · Huáng Kǎdù'ài",
        namePt: "Bruma Alta Catuaí Amarelo",
        tagline: "焦糖与黄桃的甜感，收尾带有牛奶巧克力风味。",
        description: "日晒处理的黄卡杜艾品种，中度烘焙，适合手冲与意式浓缩。",
        highlights: ["海拔 1,100 米山区种植", "手工采摘成熟咖啡果", "中度烘焙，风味均衡"],
        facts: [
          { label: "品种", value: "黄卡杜艾" },
          { label: "海拔", value: "1,100 米" },
          { label: "处理法", value: "日晒" },
          { label: "烘焙度", value: "中度烘焙" },
          { label: "净含量", value: "250 g" },
          { label: "风味", value: "焦糖、黄桃、牛奶巧克力" },
        ],
        story: "清晨的山雾为咖啡树遮挡烈日，果实成熟更慢，甜度更高。",
        priceBrlCents: 5800,
        image: "/explorar/cafe-catuai.svg",
        imageAlt: "雾峰·黄卡杜艾 咖啡示意图",
      },
      {
        slug: "microlote-natural",
        nameZh: "雾峰·微批次",
        pinyin: "Wù Fēng · Wēi Pīcì",
        namePt: "Bruma Alta Microlote Natural",
        tagline: "单一地块的小批量咖啡，带有红色莓果与可可风味。",
        description: "来自同一片山坡的微批次豆，在高架棚上缓慢日晒，浅中度烘焙。",
        highlights: ["单一地块微批次", "高架棚缓慢日晒", "红色莓果与可可风味"],
        facts: [
          { label: "品种", value: "红波旁" },
          { label: "海拔", value: "1,250 米" },
          { label: "处理法", value: "高架日晒" },
          { label: "烘焙度", value: "浅中度烘焙" },
          { label: "净含量", value: "250 g" },
          { label: "风味", value: "红色莓果、可可、蔗糖" },
        ],
        story: "每年只在收获季最好的两周采摘这一地块，产量很少。",
        priceBrlCents: 8900,
        image: "/explorar/cafe-natural.svg",
        imageAlt: "雾峰·微批次 咖啡示意图",
      },
    ],
  },
  {
    slug: "lua-mansa",
    name: "Apiário Lua Mansa",
    kind: "mel",
    kicker: "巴西蜂蜜生产者",
    category: "天然蜂蜜 · 巴西东北部",
    origin: "Picos, Piauí · Nordeste",
    intro: "巴西东北部腹地的养蜂场，蜜蜂采集原生植物花蜜，冷压过滤后装瓶。本店仅作为浏览示例。",
    products: [
      {
        slug: "silvestre",
        nameZh: "月静·腹地野花蜜",
        pinyin: "Yuè Jìng · Fùdì Yěhuā Mì",
        namePt: "Mel Silvestre do Sertão",
        tagline: "多种原生野花的花蜜，口感浓郁，带有轻微焦糖香。",
        description: "雨季过后采收，未经加热处理，只做冷压过滤。",
        highlights: ["原生野花多花种蜂蜜", "未经加热，冷压过滤", "玻璃瓶装"],
        facts: [
          { label: "花源", value: "腹地原生野花" },
          { label: "净含量", value: "300 g" },
          { label: "质地", value: "液态，易结晶" },
          { label: "风味", value: "焦糖、干果" },
        ],
        story: "养蜂场周围是半干旱的卡廷加植被，雨季后的短暂花期决定了每年的产量。",
        priceBrlCents: 4200,
        image: "/explorar/mel-silvestre.svg",
        imageAlt: "月静·腹地野花蜜 蜂蜜示意图",
      },
      {
        slug: "cajueiro",
        nameZh: "月静·腰果花蜜",
        pinyin: "Yuè Jìng · Yāoguǒ Huā Mì",
        namePt: "Mel de Flor de Cajueiro",
        tagline: "腰果树花期采集的单花蜜，清甜柔和，带有淡淡果香。",
        description: "皮奥伊州是巴西主要的腰果产区，这款蜂蜜只在腰果树开花时采收。",
        highlights: ["腰果树单花蜜", "清甜柔和，果香明显", "季节限定"],
        facts: [
          { label: "花源", value: "腰果树花" },
          { label: "净含量", value: "300 g" },
          { label: "质地", value: "液态" },
          { label: "风味", value: "清甜、淡果香" },
        ],
        story: "养蜂人在腰果园旁放置蜂箱，与果农合作，花期结束即停止采收。",
        priceBrlCents: 4900,
        image: "/explorar/mel-cajueiro.svg",
        imageAlt: "月静·腰果花蜜 蜂蜜示意图",
      },
    ],
  },
];

/** Os dados estáticos passam pelo mesmo tipo de validação de qualquer fronteira. */
export const DEMO_STORES: readonly DemoStore[] = z.array(DemoStore).min(1).parse(STORES_DATA);

export function findDemoStore(slug: string): DemoStore | null {
  return DEMO_STORES.find((s) => s.slug === slug) ?? null;
}

export function findDemoProduct(storeSlug: string, productSlug: string): { store: DemoStore; product: DemoProduct } | null {
  const store = findDemoStore(storeSlug);
  const product = store?.products.find((p) => p.slug === productSlug);
  return store && product ? { store, product } : null;
}

function demoPrice(brlCents: number) {
  // Mesma função de conversão da prévia e da publicação reais.
  return { cnyFen: convertBrlCentsToCnyFen(brlCents)!, brlCents };
}

/** Catálogo da loja fictícia no mesmo modelo do catálogo real. */
export function demoCatalogView(store: DemoStore): StoreCatalogView {
  return {
    slug: store.slug,
    producer: store.name,
    origin: store.origin,
    intro: store.intro,
    kicker: store.kicker,
    items: store.products.map(
      (p): CatalogItem => ({
        slug: p.slug,
        title: p.nameZh,
        titleLang: "zh-Hans",
        pinyin: p.pinyin,
        originalName: p.namePt,
        tagline: p.tagline,
        specs: null,
        image: { url: p.image, alt: p.imageAlt },
        price: demoPrice(p.priceBrlCents),
        category: store.category,
        tag: DEMO_LABEL,
      }),
    ),
  };
}

/** Ficha do produto fictício no mesmo modelo da vitrine real. */
export function demoShowcaseView(store: DemoStore, product: DemoProduct): ShowcaseView {
  return {
    contentLang: "zh-Hans",
    images: [{ id: product.slug, url: product.image, alt: product.imageAlt }],
    title: product.nameZh,
    titleLang: "zh-Hans",
    pinyin: product.pinyin,
    originalName: product.namePt,
    brand: null,
    tagline: product.tagline,
    description: product.description,
    highlights: product.highlights,
    facts: product.facts.map((f) => ({ ...f, valueLang: "zh-Hans" as const })),
    origin: store.origin,
    producer: store.name,
    story: product.story,
    price: demoPrice(product.priceBrlCents),
    category: store.category,
  };
}
