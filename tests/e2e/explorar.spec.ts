import path from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";
import { cleanupStoreOf } from "./helpers";

const PHOTO = path.join(__dirname, "..", "fixtures", "garrafa-teste.jpg");
const DEMO = "虚构品牌 · 演示";

async function expectNoHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
}

/**
 * T12 · Extra "Explorar mais marcas brasileiras". O produtor publica uma
 * cachaça real; no celular, o comprador abre a loja pelo link do QR, toca em
 * Explorar, entra numa marca fictícia, abre um produto e volta ao diretório,
 * sempre vendo a identificação de demonstração e sem poder consultar. Depois
 * volta à loja real e faz uma consulta: o fluxo principal segue funcionando.
 */
test("loja real → explorar → marca fictícia → ficha → diretório → consulta real", async ({ browser }) => {
  const producer = await browser.newContext();
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const name = `Cachaça Explorar ${Date.now()}`;

  try {
    // 1. Produtor publica uma cachaça e pega o link da loja (o mesmo do QR)
    const page = await producer.newPage();
    await page.goto("/meu-espaco/produtos/novo");
    await page.getByLabel("Nome da cachaça").fill(name);
    await page.getByLabel("Descrição curta").fill("Cachaça de alambique, 12 meses em amburana.");
    await page.getByLabel(/Nome do produtor ou engenho/).fill("Engenho Explorar");
    await page.getByLabel(/Preço de referência/).fill("79,00");
    await page.locator('input[type="file"]').setInputFiles(PHOTO);
    await expect(page.getByText("1 de 3 fotos")).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");
    await page.getByRole("button", { name: "Gerar apresentação chinesa" }).click();
    await expect(page).toHaveURL(/\/apresentacao$/);
    await page.getByRole("button", { name: "Publicar vitrine" }).click();
    await page.getByRole("dialog", { name: "Confirmar publicação" }).getByRole("button", { name: "Confirmar publicação" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Versão 1 publicada" })).toBeVisible();
    await page.goto("/meu-espaco/minha-loja");
    const storeUrl = new URL(await page.getByLabel("Link público").inputValue());
    // A prévia do painel não leva ao diretório.
    await expect(page.getByRole("link", { name: "探索更多巴西品牌" })).toHaveCount(0);

    // 2. Comprador no celular abre a loja real: sem selo de demonstração, link discreto no fim
    const buyer = await phone.newPage();
    await buyer.goto(storeUrl.pathname);
    await expect(buyer.getByRole("heading", { level: 1, name: "Engenho Explorar" })).toBeVisible();
    await expect(buyer.getByText(DEMO)).toHaveCount(0);
    const explore = buyer.getByRole("link", { name: "探索更多巴西品牌" });
    await explore.scrollIntoViewIfNeeded();
    await explore.click();

    // 3. Diretório: três lojas fictícias identificadas
    await expect(buyer).toHaveURL(/\/zh\/explorar\?de=/);
    await expect(buyer.getByRole("heading", { level: 1, name: "探索更多巴西品牌" })).toBeVisible();
    await expect(buyer.getByRole("main").getByText(DEMO).first()).toBeVisible();
    const stores = buyer.getByRole("list", { name: "示例店铺" }).getByRole("listitem");
    await expect(stores).toHaveCount(3);
    await expect(stores.filter({ hasText: DEMO })).toHaveCount(3);
    await expectNoHorizontalScroll(buyer);

    // 4. Loja fictícia de cachaça: catálogo próprio, cada produto marcado
    await buyer.getByRole("link", { name: /Alambique Vale Sereno/ }).click();
    await expect(buyer).toHaveURL(/\/zh\/explorar\/vale-sereno$/);
    await expect(buyer.getByRole("heading", { level: 1, name: "Alambique Vale Sereno" })).toBeVisible();
    await expect(buyer.getByText(DEMO).first()).toBeVisible();
    const products = buyer.getByRole("main").getByRole("link", { name: /查看详情/ });
    await expect(products).toHaveCount(2);
    for (const product of await products.all()) await expect(product).toContainText(DEMO);
    await expect(buyer.getByText("查看详情并询价")).toHaveCount(0);
    await expectNoHorizontalScroll(buyer);

    // 5. Ficha fictícia: selo, preço pela regra única e consulta indisponível
    await products.filter({ hasText: "静谷·琥珀" }).click();
    await expect(buyer).toHaveURL(/\/zh\/explorar\/vale-sereno\/amburana$/);
    await expect(buyer.getByRole("heading", { level: 1, name: "静谷·琥珀" })).toBeVisible();
    await expect(buyer.getByText(DEMO)).toBeVisible();
    await expect(buyer.getByText("¥148.35")).toBeVisible();
    await expect(buyer.getByRole("button", { name: /询价/ })).toBeDisabled();
    await expect(buyer.getByText(/无法发起询价/).first()).toBeVisible();
    await expect(buyer.getByRole("button", { name: "发送询价" })).toHaveCount(0);
    await expectNoHorizontalScroll(buyer);

    // 6. De volta ao diretório e, dali, à loja real de origem
    await buyer.getByRole("link", { name: "返回品牌目录" }).click();
    await expect(buyer).toHaveURL(/\/zh\/explorar$/);
    await expect(buyer.getByRole("main").getByText(DEMO).first()).toBeVisible();
    await buyer.getByRole("link", { name: "返回之前浏览的真实店铺" }).click();
    await expect(buyer).toHaveURL(storeUrl.pathname);
    await expect(buyer.getByText(DEMO)).toHaveCount(0);

    // 7. Fluxo principal intacto: abrir o produto real e enviar uma consulta
    await buyer.getByRole("link", { name: /查看详情并询价/ }).click();
    await expect(buyer).toHaveURL(/\/p\/[a-z0-9]{10}$/);
    await expect(buyer.getByRole("link", { name: "探索更多巴西品牌" })).toBeVisible();
    await buyer.getByRole("button", { name: /询价.*Solicitar cotação/ }).click();
    await buyer.getByLabel(/^留言/).fill("您好，请问可以供应200瓶吗？");
    await buyer.getByRole("button", { name: "发送询价" }).click();
    await expect(buyer).toHaveURL(/\/conversa#t=[A-Za-z0-9_-]{43}$/);
    await expect(buyer.getByText("您好，请问可以供应200瓶吗？")).toBeVisible();

    await page.goto("/meu-espaco/mensagens");
    await expect(page.getByRole("list", { name: "Conversas" }).getByRole("link").first()).toContainText(name);
  } finally {
    await cleanupStoreOf(producer);
    await producer.close();
    await phone.close();
  }
});
