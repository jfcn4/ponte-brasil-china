import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";
import QRCode from "qrcode";
import { cleanupStoreOf } from "./helpers";

const PHOTO = path.join(__dirname, "..", "fixtures", "garrafa-teste.jpg");
const PDF_DIR = path.join(__dirname, "..", "..", "test-results", "cartao-feira");

async function publishCachaca(page: Page, name: string, price: string) {
  await page.goto("/meu-espaco/produtos/novo");
  await page.getByLabel("Nome da cachaça").fill(name);
  await page.getByLabel("Descrição curta").fill("Cachaça de alambique, 12 meses em amburana.");
  await page.getByLabel(/^Volume/).fill("700");
  await page.getByLabel(/Nome do produtor ou engenho/).fill("Engenho Feira E2E");
  await page.getByLabel(/^Cidade/).fill("Salinas");
  await page.getByLabel(/Preço de referência/).fill(price);
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.getByText("1 de 3 fotos")).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");
  await page.getByRole("button", { name: "Gerar apresentação chinesa" }).click();
  await expect(page).toHaveURL(/\/apresentacao$/);
  await page.getByRole("button", { name: "Publicar vitrine" }).click();
  await page.getByRole("dialog", { name: "Confirmar publicação" }).getByRole("button", { name: "Confirmar publicação" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Versão 1 publicada" })).toBeVisible();
}

/**
 * Modo Feira (extra). Loja com duas cachaças publicadas e um rascunho: o
 * cartão mostra produtor, região, foto do destaque e a chamada bilíngue, com
 * o mesmo QR e endereço de "Minha loja". Na impressão, cabe numa página A4
 * sem os controles do painel. O endereço do QR abre o catálogo num celular sem
 * sessão, que chega à vitrine do segundo produto e envia uma cotação.
 */
test("Minha loja → cartão para feira → PDF de uma página → QR → vitrine → cotação", async ({ browser }) => {
  // Duas publicações completas e uma consulta: o dobro do trabalho dos outros aceites.
  test.setTimeout(180_000);
  const producer = await browser.newContext();
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const stamp = Date.now();
  const first = `Cachaça Feira Um ${stamp}`;
  const second = `Cachaça Feira Dois ${stamp}`;

  try {
    // 1. Duas cachaças publicadas e um rascunho na mesma loja
    const page = await producer.newPage();
    await publishCachaca(page, first, "79,00");
    await publishCachaca(page, second, "89,00");
    await page.goto("/meu-espaco/produtos/novo");
    await page.getByLabel("Nome da cachaça").fill(`Rascunho Feira ${stamp}`);
    await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");

    // 2. Minha loja: link, QR e a ação do Modo Feira
    await page.goto("/meu-espaco/minha-loja");
    const storeUrl = await page.getByLabel("Link público").inputValue();
    expect(storeUrl).toMatch(/\/l\/[a-z0-9]{10}$/);
    const storeQr = await page.getByRole("img", { name: `QR code do catálogo da loja: ${storeUrl}` }).innerHTML();
    await page.getByRole("link", { name: "Criar cartão para feira" }).click();
    await expect(page).toHaveURL(/\/meu-espaco\/minha-loja\/cartao$/);
    await expect(page.getByRole("heading", { level: 1, name: "Cartão para feira" })).toBeVisible();

    // 3. Prévia: produtor, região, destaque com foto, chamada bilíngue, QR e endereço
    const card = page.getByRole("article", { name: "Engenho Feira E2E" });
    await expect(card.getByRole("heading", { name: "Engenho Feira E2E" })).toBeVisible();
    await expect(card.getByText(/Salinas/)).toBeVisible();
    await expect(card.getByText("扫码浏览我们的产品目录")).toBeVisible();
    await expect(card.getByText("Aponte a câmera e conheça nosso catálogo")).toBeVisible();
    await expect(card.getByText(first)).toBeVisible();
    await expect(card.getByText(second)).toHaveCount(0);
    await expect(card.getByText(/Rascunho Feira/)).toHaveCount(0);
    await expect(card.getByText("¥")).toHaveCount(0);
    const photo = card.getByRole("img", { name: /主图$/ });
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    const qr = card.getByRole("img", { name: `QR code do catálogo da loja: ${storeUrl}` });
    await expect(qr).toBeVisible();
    // Mesmo QR de Minha loja, e ele codifica exatamente o endereço da loja.
    expect(await qr.innerHTML()).toBe(storeQr);
    const expectedSvg = await QRCode.toString(storeUrl, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 2,
      color: { dark: "#24201f", light: "#ffffff" },
    });
    const normalize = (svg: string) => svg.replace(/><\/path>/g, "/>").replace(/\s+/g, "");
    expect(normalize(storeQr)).toBe(normalize(expectedSvg));
    const parsed = new URL(storeUrl);
    await expect(card.getByTestId("cartao-endereco")).toHaveText(`${parsed.host}${parsed.pathname}`);
    await expect(page.getByRole("button", { name: "Imprimir ou salvar em PDF" })).toBeEnabled();

    // 4. Versão impressa: sem painel nem controles; uma única página A4
    await page.emulateMedia({ media: "print" });
    await expect(page.getByRole("navigation")).toBeHidden();
    await expect(page.getByRole("button", { name: "Imprimir ou salvar em PDF" })).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: "Cartão para feira" })).toBeHidden();
    await expect(qr).toBeVisible();
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: false });
    const pages = pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? [];
    expect(pages).toHaveLength(1);
    mkdirSync(PDF_DIR, { recursive: true });
    writeFileSync(path.join(PDF_DIR, "cartao-feira.pdf"), pdf);
    await test.info().attach("cartao-feira.pdf", { body: pdf, contentType: "application/pdf" });
    await page.emulateMedia({ media: "screen" });

    // 5. Celular sem sessão abre o endereço do QR: catálogo certo, só os publicados
    const buyer = await phone.newPage();
    await buyer.goto(parsed.pathname);
    await expect(buyer.getByRole("heading", { level: 1, name: "Engenho Feira E2E" })).toBeVisible();
    await expect(buyer.getByText(first)).toBeVisible();
    await expect(buyer.getByText(second)).toBeVisible();
    await expect(buyer.getByText(/Rascunho Feira/)).toHaveCount(0);

    // 6. Vitrine do segundo produto e cotação
    await buyer.getByRole("link").filter({ hasText: second }).click();
    await expect(buyer).toHaveURL(/\/p\/[a-z0-9]{10}$/);
    await expect(buyer.getByText(second).first()).toBeVisible();
    await buyer.getByRole("button", { name: /询价.*Solicitar cotação/ }).first().click();
    await buyer.getByLabel(/^留言/).fill("你好，我们在展会上看到你们的名片。请问300瓶的价格是多少？");
    await buyer.getByRole("button", { name: "发送询价" }).click();
    await expect(buyer).toHaveURL(/\/conversa#t=[A-Za-z0-9_-]{43}$/);
    await expect(buyer.getByRole("heading", { name: "询价对话" })).toBeVisible();

    // 7. O produtor recebe a consulta sobre o produto certo
    await page.goto("/meu-espaco/mensagens");
    await expect(page.getByText(second).first()).toBeVisible();
  } finally {
    await cleanupStoreOf(producer);
    await producer.close();
    await phone.close();
  }
});

test("sem loja publicada, o cartão explica o que falta", async ({ page }) => {
  await page.goto("/meu-espaco/minha-loja/cartao");
  await expect(page.getByText(/Publique o primeiro produto/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Imprimir ou salvar em PDF" })).toHaveCount(0);
});
