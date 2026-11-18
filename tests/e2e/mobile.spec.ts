import { expect, test } from "@playwright/test";
import { cleanupStoreOf } from "./helpers";

async function expectNoHorizontalScroll(page: import("@playwright/test").Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
}

test("celular: início, cadastro e prévia sem rolagem lateral", async ({ page, context }) => {
  try {
    await page.goto("/");
    await expectNoHorizontalScroll(page);
    const cta = page.getByRole("link", { name: "Criar minha vitrine" }).first();
    await expect(cta).toBeInViewport();

    await cta.click();
    await expect(page.getByRole("heading", { name: "Nova cachaça" })).toBeVisible();
    await expectNoHorizontalScroll(page);

    await page.getByLabel("Nome da cachaça").fill("Cachaça no celular");
    await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");

    await page.getByRole("button", { name: "Ver prévia" }).click();
    const dialog = page.getByRole("dialog", { name: "Prévia da vitrine" });
    await expect(dialog.getByRole("heading", { name: "Cachaça no celular" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Ver prévia" })).toBeFocused();

    await page.goto("/meu-espaco/produtos");
    await expectNoHorizontalScroll(page);
    await expect(page.getByText("Cachaça no celular")).toBeVisible();
  } finally {
    await cleanupStoreOf(context);
  }
});
