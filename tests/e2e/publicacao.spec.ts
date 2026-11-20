import path from "node:path";
import { devices, expect, test } from "@playwright/test";
import { cleanupStoreOf, setStoreOrigin } from "./helpers";

const PHOTO = path.join(__dirname, "..", "fixtures", "garrafa-teste.jpg");

/**
 * Aceite desta entrega: abrir um rascunho existente, gerar e escolher um nome,
 * publicar e abrir o link do QR em outro aparelho (contexto de celular, sem a
 * sessão do produtor). A vitrine mostra foto, nome aprovado e ¥90.85. Uma
 * edição privada (R$ 89,00) só aparece no mesmo link depois de republicar.
 * O servidor de teste roda com AI_MODE=test (respostas determinísticas).
 */
test("rascunho → nome chinês → publicação → link público estável", async ({ browser }) => {
  const producer = await browser.newContext();
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const name = `Cachaça Vitrine ${Date.now()}`;

  try {
    // 1. Rascunho com foto real, preço e produtor
    const page = await producer.newPage();
    await setStoreOrigin(page, "Engenho E2E");
    await page.goto("/meu-espaco/produtos/novo");
    await page.getByLabel("Nome da cachaça").fill(name);
    await page.getByLabel("Descrição curta").fill("Cachaça de alambique, 12 meses em amburana.");
    await page.getByLabel(/^Volume/).fill("700");
    await page.getByLabel(/Preço de referência/).fill("79,00");
    await page.locator('input[type="file"]').setInputFiles(PHOTO);
    await expect(page.getByText("1 de 3 fotos")).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");

    // 2. Abre o rascunho existente pelo painel
    await page.goto("/meu-espaco/produtos");
    const item = page.getByRole("listitem").filter({ hasText: name });
    await expect(page.getByRole("tab", { name: /Rascunhos \(1\)/ })).toHaveAttribute("aria-selected", "true");
    await item.getByRole("link", { name: `Editar ${name}` }).click();
    await expect(page.getByLabel("Nome da cachaça")).toHaveValue(name);

    // 3. Gera a apresentação chinesa
    await page.getByRole("button", { name: "Gerar versão em chinês" }).click();
    await expect(page).toHaveURL(/\/apresentacao$/);
    await expect(page.getByRole("heading", { name: "Apresentação em chinês" })).toBeVisible();
    await expect(page.getByText("Resposta de teste")).toBeVisible();
    const options = page.getByRole("group", { name: "Escolha o nome" });
    await expect(options.getByRole("radio")).toHaveCount(4);
    await expect(options.getByRole("radio", { name: /Equilibrada/ })).toBeChecked();

    // 4. Escolhe a opção semântica; a prévia acompanha
    await options.getByRole("radio", { name: /Semântica/ }).check();
    const preview = page.getByRole("complementary", { name: "Prévia da vitrine" });
    await expect(preview.getByRole("heading", { name: "蓝山醇" })).toBeVisible();
    await expect(preview.getByText("¥90.85")).toBeVisible();

    // 5. Publica só após confirmar
    await page.getByRole("button", { name: "Publicar vitrine" }).click();
    const dialog = page.getByRole("dialog", { name: "Confirmar publicação" });
    await expect(dialog.getByText("参考价格 ¥90.85")).toBeVisible();
    await dialog.getByRole("button", { name: "Confirmar publicação" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Versão 1 publicada" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Link e QR do produto" })).toBeFocused();

    const link = await page.getByLabel("Link público").inputValue();
    expect(link).toMatch(/\/p\/[a-z0-9]{10}$/);
    await expect(page.getByRole("img", { name: `QR code da vitrine: ${link}` })).toBeVisible();
    const publicPath = new URL(link).pathname;

    // 6. Outro aparelho, sem sessão: vitrine com foto, nome aprovado e preço
    const buyer = await phone.newPage();
    await buyer.goto(publicPath);
    await expect(buyer.getByRole("heading", { level: 1, name: "蓝山醇" })).toBeVisible();
    await expect(buyer.getByText("Lán Shān Chún")).toBeVisible();
    await expect(buyer.getByText("¥90.85")).toBeVisible();
    await expect(buyer.getByText("BRL 79.00")).toBeVisible();
    const photo = buyer.getByRole("img", { name: "蓝山醇 主图" });
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // O link público não abre a gestão
    await buyer.goto("/meu-espaco/produtos");
    await expect(buyer.getByText("Nenhum produto ainda")).toBeVisible();

    // 7. Edição privada do preço: o mesmo link continua em ¥90.85
    await page.goto("/meu-espaco/produtos");
    await expect(page.getByRole("tab", { name: /Publicados \(1\)/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("listitem").filter({ hasText: name }).getByText("R$ 79,00")).toBeVisible();
    await page.getByRole("link", { name: `Editar ${name}` }).click();
    await page.getByLabel(/Preço de referência/).fill("89,00");
    await expect(page.getByText("参考价格 ¥102.35").first()).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");
    await expect(page.getByText("Alterações pendentes").first()).toBeVisible();

    await buyer.goto(publicPath);
    await expect(buyer.getByText("¥90.85")).toBeVisible();
    await expect(buyer.getByText("¥102.35")).toHaveCount(0);

    // 8. Republica: mesmo endereço, novo preço
    await page.getByRole("button", { name: "Revisar apresentação e republicar" }).click();
    await expect(page.getByText(/Alterações pendentes: o cadastro mudou/)).toBeVisible();
    await expect(page.getByRole("radio", { name: /Semântica/ })).toBeChecked();
    await page.getByRole("button", { name: "Republicar vitrine" }).click();
    await expect(dialog.getByText("参考价格 ¥102.35")).toBeVisible();
    await expect(dialog.getByText("Substitui a versão 1 no mesmo link e QR.")).toBeVisible();
    await dialog.getByRole("button", { name: "Confirmar publicação" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Versão 2 publicada" })).toBeVisible();
    expect(await page.getByLabel("Link público").inputValue()).toBe(link);

    await buyer.goto(publicPath);
    await expect(buyer.getByText("¥102.35")).toBeVisible();
    await expect(buyer.getByText("BRL 89.00")).toBeVisible();
    await expect(buyer.getByRole("heading", { level: 1, name: "蓝山醇" })).toBeVisible();
  } finally {
    await cleanupStoreOf(producer);
    await producer.close();
    await phone.close();
  }
});

test("link público inexistente mostra aviso em chinês", async ({ page }) => {
  await page.goto("/p/zzzzzzzzzz");
  await expect(page.getByRole("heading", { name: "该产品已不可用" })).toBeVisible();
});
