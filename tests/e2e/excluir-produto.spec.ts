import path from "node:path";
import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cleanupStoreOf } from "./helpers";

const PHOTO = path.join(__dirname, "..", "fixtures", "garrafa-teste.jpg");

/**
 * Exclusão definitiva em Produtos. Duas cachaças de demonstração publicadas, cada
 * uma com uma conversa de comprador. Cancelar não altera nada; excluir a primeira
 * apaga produto e conversa (conferido após recarregar), o outro produto continua
 * com sua conversa, o destaque passa ao próximo, e o QR e o link privado antigos
 * abrem as telas de indisponibilidade. AI_MODE=test no servidor.
 */
async function publish(page: Page, name: string): Promise<string> {
  await page.goto("/meu-espaco/produtos/novo");
  await page.getByLabel("Nome da cachaça").fill(name);
  await page.getByLabel("Descrição curta").fill("Cachaça de alambique, 12 meses em amburana.");
  await page.getByLabel(/^Volume/).fill("700");
  await page.getByLabel(/Nome do produtor ou engenho/).fill("Engenho Exclusão");
  await page.getByLabel(/Preço de referência/).fill("79,00");
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.getByText("1 de 3 fotos")).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");
  await page.getByRole("button", { name: "Gerar apresentação chinesa" }).click();
  await expect(page).toHaveURL(/\/apresentacao$/);
  await page.getByRole("button", { name: "Publicar vitrine" }).click();
  await page.getByRole("dialog", { name: "Confirmar publicação" }).getByRole("button", { name: "Confirmar publicação" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Versão 1 publicada" })).toBeVisible();
  return new URL(await page.getByLabel("Link público").inputValue()).pathname;
}

async function inquire(context: BrowserContext, publicPath: string, text: string): Promise<string> {
  const buyer = await context.newPage();
  await buyer.goto(publicPath);
  await buyer.getByRole("button", { name: /询价.*Solicitar cotação/ }).last().click();
  await buyer.getByLabel(/^留言/).fill(text);
  await buyer.getByRole("button", { name: "发送询价" }).click();
  await expect(buyer).toHaveURL(/\/conversa#t=[A-Za-z0-9_-]{43}$/);
  await expect(buyer.getByText(text)).toBeVisible();
  const link = buyer.url();
  await buyer.close();
  return link;
}

async function snapshot(page: Page) {
  await page.goto("/meu-espaco/produtos");
  const products = await page.getByRole("list", { name: "Produtos publicados, na ordem do catálogo" }).getByRole("listitem").allInnerTexts();
  await page.goto("/meu-espaco/mensagens");
  const conversations = await page.getByRole("list", { name: "Conversas" }).getByRole("link").allInnerTexts();
  return { products, conversations };
}

test.setTimeout(180_000);

test("excluir produto: cancelar não muda nada; excluir apaga só aquele produto e suas conversas", async ({ browser }) => {
  const producer = await browser.newContext({ ...devices["Desktop Chrome"] });
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const stamp = Date.now();
  const A = `Demo Excluir Alfa ${stamp}`;
  const B = `Demo Excluir Beta ${stamp}`;
  const QA = "您好！请问你们能供应500瓶吗？（产品A）";
  const QB = "您好！可以送到上海吗？（产品B）";

  try {
    const page = await producer.newPage();
    const pathA = await publish(page, A);
    const pathB = await publish(page, B);
    const linkA = await inquire(phone, pathA, QA);
    const linkB = await inquire(phone, pathB, QB);

    // Estado antes: dois publicados, duas conversas, destaque = A.
    const before = await snapshot(page);
    expect(before.products).toHaveLength(2);
    expect(before.conversations).toHaveLength(2);
    await page.goto("/meu-espaco/produtos");
    await expect(page.getByRole("listitem").filter({ hasText: A })).toContainText("Destaque da loja");

    // Menu do item → confirmação com o nome e o número de conversas; Cancelar.
    const itemA = page.getByRole("listitem").filter({ hasText: A });
    await itemA.getByRole("button", { name: `Mais ações de ${A}` }).click();
    await page.getByRole("menuitem", { name: "Excluir produto" }).click();
    const dialog = page.getByRole("dialog", { name: "Excluir produto" });
    await expect(dialog).toContainText(A);
    await expect(dialog).toContainText("1 conversa será apagada (1 mensagem)");
    await expect(dialog).toContainText("Isso vai apagar definitivamente o produto e todas as conversas sobre ele, incluindo as mensagens.");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    // Esc também cancela e devolve a tela como estava.
    await itemA.getByRole("button", { name: `Mais ações de ${A}` }).click();
    await page.getByRole("menuitem", { name: "Excluir produto" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const afterCancel = await snapshot(page);
    expect(afterCancel).toEqual(before);

    // Exclui A de fato.
    await page.goto("/meu-espaco/produtos");
    await page.getByRole("listitem").filter({ hasText: A }).getByRole("button", { name: `Mais ações de ${A}` }).click();
    await page.getByRole("menuitem", { name: "Excluir produto" }).click();
    await dialog.getByRole("button", { name: "Excluir definitivamente" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.locator("p.text-ok").filter({ hasText: /excluído definitivamente, com 1 conversa/ })).toBeVisible();
    // Sem recarregar: A saiu e B assumiu o destaque.
    await expect(page.getByRole("listitem").filter({ hasText: A })).toHaveCount(0);
    await expect(page.getByRole("listitem").filter({ hasText: B })).toContainText("Destaque da loja");
    await expect(page.getByText("1 produto nesta loja")).toBeVisible();

    // Depois de recarregar: A e sua conversa sumiram; B e a dele continuam.
    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: A })).toHaveCount(0);
    await expect(page.getByRole("listitem").filter({ hasText: B })).toContainText("Destaque da loja");
    await page.goto("/meu-espaco/mensagens");
    const list = page.getByRole("list", { name: "Conversas" }).getByRole("link");
    await expect(list).toHaveCount(1);
    await expect(list.first()).toContainText(B);
    await expect(page.getByRole("navigation", { name: "Meu espaço" }).getByLabel("1 conversa com novidades")).toBeVisible();

    // Loja pública: só B.
    const catalog = await phone.newPage();
    await catalog.goto(pathB);
    await catalog.getByRole("link", { name: /返回店铺/ }).click();
    await expect(catalog.locator(`a[href="${pathB}"]`)).toHaveCount(1);
    await expect(catalog.locator(`a[href="${pathA}"]`)).toHaveCount(0);

    // QR antigo e links privados.
    const qr = await phone.newPage();
    await qr.goto(pathA);
    await expect(qr.getByRole("heading", { name: "该产品已不可用" })).toBeVisible();
    await qr.goto(pathB);
    await expect(qr.getByRole("heading", { level: 1 })).toBeVisible();
    const oldChat = await phone.newPage();
    await oldChat.goto(linkA);
    await expect(oldChat.getByRole("heading", { name: "该对话已不可用" })).toBeVisible();
    const keptChat = await phone.newPage();
    await keptChat.goto(linkB);
    await expect(keptChat.getByText(QB)).toBeVisible();
  } finally {
    await cleanupStoreOf(producer);
    await producer.close();
    await phone.close();
  }
});
