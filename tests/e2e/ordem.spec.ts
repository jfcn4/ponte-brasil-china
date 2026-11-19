import path from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";
import { cleanupStoreOf } from "./helpers";

const PHOTO = path.join(__dirname, "..", "fixtures", "garrafa-teste.jpg");

/**
 * Alça de seis pontos em Produtos: arraste com mouse e toque, teclado
 * (Espaço/setas/Esc), gravação ao soltar e destaque público = primeiro
 * publicado. Duas cachaças publicadas e um rascunho; AI_MODE=test.
 */
async function draft(page: Page, name: string) {
  await page.goto("/meu-espaco/produtos/novo");
  await page.getByLabel("Nome da cachaça").fill(name);
  await page
    .getByLabel("Descrição curta")
    .fill("Cachaça de alambique, 12 meses em amburana.");
  await page.getByLabel(/^Volume/).fill("700");
  await page.getByLabel(/Nome do produtor ou engenho/).fill("Engenho Ordem");
  await page.getByLabel(/Preço de referência/).fill("79,00");
  await page.locator('input[type="file"]').setInputFiles(PHOTO);
  await expect(page.getByText("1 de 3 fotos")).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText(
    "Rascunho salvo",
  );
}

async function publish(page: Page, name: string) {
  await draft(page, name);
  await page
    .getByRole("button", { name: "Gerar apresentação chinesa" })
    .click();
  await expect(
    page.getByRole("group", { name: "Escolha o nome" }).getByRole("radio"),
  ).toHaveCount(4);
  await page
    .getByRole("button", { name: /^(Re)?[Pp]ublicar vitrine$/ })
    .click();
  await page
    .getByRole("dialog", { name: "Confirmar publicação" })
    .getByRole("button", { name: "Confirmar publicação" })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: /Versão \d+ publicada/ }),
  ).toBeVisible();
}

test("alça: mouse, toque e teclado gravam a ordem e movem o destaque", async ({
  browser,
}) => {
  const producer = await browser.newContext({
    ...devices["Desktop Chrome"],
    hasTouch: true,
  });
  const buyerCtx = await browser.newContext();
  const stamp = Date.now();
  const A = `Ordem Alfa ${stamp}`;
  const B = `Ordem Beta ${stamp}`;
  const D = `Ordem Rascunho ${stamp}`;
  try {
    const page = await producer.newPage();
    await publish(page, A);
    await publish(page, B);
    await draft(page, D);

    await page.goto("/meu-espaco/minha-loja");
    const store = new URL(await page.getByLabel("Link público").inputValue())
      .pathname;
    const buyer = await buyerCtx.newPage();
    const featuredOnStore = async () => {
      await buyer.goto(store);
      return buyer.getByRole("region", { name: "精选推荐" });
    };
    await expect(await featuredOnStore()).toBeVisible();

    await page.goto("/meu-espaco/produtos");
    const list = page.getByRole("list", {
      name: "Produtos publicados, na ordem do catálogo",
    });
    const items = list.getByRole("listitem");
    const handle = (n: string) =>
      page.getByRole("button", { name: new RegExp(`^Reordenar ${n}`) });
    await expect(items.first()).toContainText(A);
    await expect(page.getByRole("button", { name: /Mover para/ })).toHaveCount(
      0,
    );
    await page.screenshot({
      path: "test-results/ordem-alcas.png",
      fullPage: true,
    });

    // Celular: layout com a alça à direita
    const phone = await browser.newContext({ ...devices["Pixel 7"] });
    const mp = await phone.newPage();
    await mp.context().addCookies(await producer.cookies());
    await mp.goto("/meu-espaco/produtos");
    await expect(
      mp.getByRole("button", { name: /^Reordenar/ }).first(),
    ).toBeVisible();
    await mp.screenshot({
      path: "test-results/ordem-celular.png",
      fullPage: true,
    });
    const overflow = await mp.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await phone.close();

    // Mouse: arrasta B sobre A
    const hb = (await handle(B).boundingBox())!;
    const ha = (await items.first().boundingBox())!;
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2, ha.y + 4, { steps: 8 });
    await page.screenshot({ path: "test-results/ordem-arrasto.png" });
    await page.mouse.up();
    await expect(
      page.getByText(/Ordem salva\. .* posição 1 de 2/).first(),
    ).toBeVisible();
    await expect(items.first()).toContainText(B);
    await page.reload();
    await expect(items.first()).toContainText(B);
    await expect(await featuredOnStore()).toContainText(B);

    // Toque (CDP): arrasta A sobre B pela alça
    await page.goto("/meu-espaco/produtos");
    const cdp = await producer.newCDPSession(page);
    const hA = (await handle(A).boundingBox())!;
    const first = (await items.first().boundingBox())!;
    const x = hA.x + hA.width / 2;
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
    await touch("touchStart", hA.y + hA.height / 2);
    for (let i = 1; i <= 8; i++)
      await touch(
        "touchMove",
        hA.y + hA.height / 2 + ((first.y + 4 - hA.y - hA.height / 2) * i) / 8,
      );
    await touch("touchEnd", 0);
    await expect(
      page.getByText(/Ordem salva\. .* posição 1 de 2/).first(),
    ).toBeVisible();
    await page.reload();
    await expect(items.first()).toContainText(A);

    // Teclado: Esc cancela; Espaço + seta + Espaço grava; foco permanece na alça
    await handle(A).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await expect(items.last()).toContainText(A);
    await page.keyboard.press("Escape");
    await expect(items.first()).toContainText(A);
    await expect(handle(A)).toBeFocused();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect(
      page.getByText(/Ordem salva\. .* posição 2 de 2/).first(),
    ).toBeVisible();
    await expect(handle(A)).toBeFocused();
    await page.reload();
    await expect(items.first()).toContainText(B);
    await expect(await featuredOnStore()).toContainText(B);

    // Falha na gravação: restaura a última ordem salva e avisa
    await page.route("**/api/stores/catalog/order", (r) =>
      r.request().method() === "PUT" ? r.abort() : r.continue(),
    );
    await handle(B).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect(
      page
        .getByText(/última ordem salva foi restaurada.*tentar de novo/)
        .first(),
    ).toBeVisible();
    await expect(items.first()).toContainText(B);
    await page.unroute("**/api/stores/catalog/order");

    // Rascunho no topo (pela API): o destaque público continua sendo o primeiro publicado
    const current = await (
      await page.request.get("/api/stores/catalog/order")
    ).json();
    const ids: string[] = current.products.map((p: { id: string }) => p.id);
    const draftId = current.products.find(
      (p: { name: string | null }) => p.name === D,
    ).id;
    const put = await page.request.put("/api/stores/catalog/order", {
      data: {
        productIds: [draftId, ...ids.filter((i) => i !== draftId)],
        expectedRevision: current.catalogRevision,
      },
    });
    expect(put.ok()).toBe(true);
    await expect(await featuredOnStore()).toContainText(B);
    await expect(buyer.getByText(D)).toHaveCount(0);
  } finally {
    await cleanupStoreOf(producer);
    await producer.close();
    await buyerCtx.close();
  }
});
