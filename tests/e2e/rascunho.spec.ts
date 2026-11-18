import path from "node:path";
import { expect, test } from "@playwright/test";
import { EMPTY_FORM, formToDraft } from "../../src/modules/products/form";
import { cleanupStoreOf } from "./helpers";

const PHOTO = path.join(__dirname, "..", "fixtures", "garrafa-teste.jpg");

/**
 * Critério de aceite desta entrega: cadastrar com foto, fechar a aba, voltar
 * pelo mesmo navegador e editar o rascunho com a foto preservada; uma janela
 * anônima (outro contexto) vê um painel separado e não abre o produto.
 */
test("rascunho com foto sobrevive ao fechamento da aba e fica isolado de outra sessão", async ({ browser }) => {
  const producer = await browser.newContext();
  const incognito = await browser.newContext();
  const name = `Cachaça E2E ${Date.now()}`;

  try {
    // 1. Página inicial → cadastro
    const page = await producer.newPage();
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Seu produto brasileiro. Seu próximo comprador, chinês.",
    );
    await page.getByRole("link", { name: "Criar minha vitrine" }).first().click();
    await expect(page.getByRole("heading", { name: "Nova cachaça" })).toBeVisible();

    // 2. Preenche parte do cadastro e envia uma foto real (fixture JPEG)
    await page.getByLabel("Nome da cachaça").fill(name);
    await page.getByLabel("Descrição curta").fill("Cachaça de alambique, 12 meses em carvalho.");
    await page.getByLabel(/Preço de referência/).fill("79,00");
    await expect(page.getByText("参考价格 ¥90.85").first()).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles(PHOTO);

    await expect(page.getByText("1 de 3 fotos")).toBeVisible();
    await expect(page.getByAltText("Foto principal", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");
    await expect(page).toHaveURL(/\/meu-espaco\/produtos\/[0-9a-f-]{36}$/);
    const productUrl = page.url();

    // Prévia acompanha o preenchimento
    const preview = page.getByRole("complementary", { name: "Prévia da vitrine" });
    await expect(preview.getByRole("heading", { name })).toBeVisible();
    await expect(preview.getByRole("img", { name: `Foto principal de ${name}` })).toBeVisible();

    // 3. Fecha a aba e volta pelo mesmo navegador
    await page.close();
    const again = await producer.newPage();
    await again.goto("/meu-espaco/produtos");
    const item = again.getByRole("listitem").filter({ hasText: name });
    await expect(item).toBeVisible();
    await expect(item.getByText("Rascunho")).toBeVisible();
    await expect(item.getByRole("img", { name: `Foto principal de ${name}` })).toBeVisible();

    // 4. Edita o rascunho com a foto preservada
    await item.getByRole("link", { name: `Editar ${name}` }).click();
    await expect(again.getByRole("heading", { name: "Editar cachaça" })).toBeVisible();
    await expect(again.getByLabel("Nome da cachaça")).toHaveValue(name);
    await expect(again.getByLabel(/Preço de referência/)).toHaveValue("79,00");
    await expect(again.getByAltText("Foto principal", { exact: true })).toBeVisible();
    await again.getByLabel("Descrição curta").fill("Editada após reabrir o navegador.");
    await expect(again.getByRole("status").first()).toContainText("Rascunho salvo");
    await again.reload();
    await expect(again.getByLabel("Descrição curta")).toHaveValue("Editada após reabrir o navegador.");

    // 5. Janela anônima: painel separado e sem acesso ao rascunho
    const other = await incognito.newPage();
    await other.goto("/meu-espaco/produtos");
    await expect(other.getByText("Nenhum produto ainda")).toBeVisible();
    await other.goto(productUrl);
    await expect(other.getByRole("heading", { name: "Produto não encontrado neste espaço" })).toBeVisible();

    // A API também recusa mutação de outra sessão
    const productId = productUrl.split("/").pop();
    const intruder = formToDraft({ ...EMPTY_FORM, name: "Invasão" });
    const forbidden = await other.request.put(`/api/products/${productId}`, {
      headers: { origin: new URL(productUrl).origin },
      data: { expectedRevision: 2, product: intruder.product, store: intruder.store },
    });
    expect(forbidden.status()).toBe(404);
  } finally {
    await cleanupStoreOf(producer);
    await cleanupStoreOf(incognito);
    await producer.close();
    await incognito.close();
  }
});

test("recusa a quarta foto", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("/meu-espaco/produtos/novo");
    await page.getByLabel("Nome da cachaça").fill("Limite de fotos");
    await page.locator('input[type="file"]').setInputFiles([PHOTO, PHOTO, PHOTO, PHOTO]);
    await expect(page.getByText("Cada produto aceita até três fotos. 1 foto não foi adicionada.")).toBeVisible();
    await expect(page.getByText("3 de 3 fotos")).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('input[type="file"]')).toHaveCount(0);

    // Tornar principal reordena; recarregar preserva a ordem
    await page.getByRole("button", { name: "Tornar a foto 3 a principal" }).click();
    await expect(page.getByRole("button", { name: "Tornar a foto 3 a principal" })).toBeEnabled();
    await page.reload();
    await expect(page.getByText("3 de 3 fotos")).toBeVisible();
  } finally {
    await cleanupStoreOf(context);
    await context.close();
  }
});
