import path from "node:path";
import { devices, expect, test, type Page } from "@playwright/test";
import { cleanupStoreOf } from "./helpers";

const PHOTO = path.join(__dirname, "..", "fixtures", "garrafa-teste.jpg");
const QUESTION = "您好！我们是上海的进口商。请问你们能供应500瓶吗？可以送到上海吗？";

async function expectNoHorizontalScroll(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll).toBeLessThanOrEqual(client);
}

/**
 * Aceite desta entrega, em dois navegadores: o produtor publica uma cachaça;
 * o comprador (contexto de celular, sem sessão) abre o link do QR, pergunta
 * sobre 500 garrafas com entrega em Xangai e recebe um link privado. No painel,
 * o produtor lê a tradução, vê as pendências, usa a sugestão, edita, revisa a
 * tradução (edição invalida a prévia) e confirma. O comprador volta pelo link
 * privado e vê uma única resposta em chinês. AI_MODE=test no servidor.
 */
test("vitrine → 询价 → tradução e copiloto → resposta revisada → link privado", async ({ browser }) => {
  const producer = await browser.newContext();
  const phone = await browser.newContext({ ...devices["Pixel 7"] });
  const name = `Cachaça Conversa ${Date.now()}`;

  try {
    // 1. Produtor publica um produto de 700 mL
    const page = await producer.newPage();
    await page.goto("/meu-espaco/produtos/novo");
    await page.getByLabel("Nome da cachaça").fill(name);
    await page.getByLabel("Descrição curta").fill("Cachaça de alambique, 12 meses em amburana.");
    await page.getByLabel(/^Volume/).fill("700");
    await page.getByLabel(/Nome do produtor ou engenho/).fill("Engenho E2E");
    await page.getByLabel(/Preço de referência/).fill("79,00");
    await page.locator('input[type="file"]').setInputFiles(PHOTO);
    await expect(page.getByText("1 de 3 fotos")).toBeVisible();
    await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");
    await page.getByRole("button", { name: "Gerar apresentação chinesa" }).click();
    await expect(page).toHaveURL(/\/apresentacao$/);
    await page.getByRole("button", { name: "Publicar vitrine" }).click();
    await page.getByRole("dialog", { name: "Confirmar publicação" }).getByRole("button", { name: "Confirmar publicação" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Versão 1 publicada" })).toBeVisible();
    const link = await page.getByLabel("Link público").inputValue();
    // O QR codifica o mesmo endereço do link copiável.
    await expect(page.getByRole("img", { name: `QR code da vitrine: ${link}` })).toBeVisible();

    // 2. Comprador no celular, sem sessão: abre a vitrine e pergunta
    const buyer = await phone.newPage();
    await buyer.goto(new URL(link).pathname);
    await buyer.getByRole("button", { name: /询价.*Solicitar cotação/ }).click();
    await buyer.getByLabel(/^留言/).fill(QUESTION);
    await buyer.getByLabel("公司（选填）").fill("上海测试贸易");
    await buyer.getByRole("button", { name: "发送询价" }).click();
    await expect(buyer).toHaveURL(/\/conversa#t=[A-Za-z0-9_-]{43}$/);
    const privateLink = buyer.url();
    await expect(buyer.getByRole("heading", { name: "询价对话" })).toBeVisible();
    await expect(buyer.getByRole("textbox", { name: "私密链接" })).toHaveValue(privateLink);
    await expect(buyer.getByText(QUESTION)).toBeVisible();
    await expect(buyer.getByText(/留言已送达/)).toBeVisible();
    await expect(buyer.getByText(/第 1 版/)).toBeVisible();
    await expectNoHorizontalScroll(buyer);

    // 3. Painel: badge, conversa nova e aguardando resposta
    await page.goto("/meu-espaco/mensagens");
    const nav = page.getByRole("navigation", { name: "Meu espaço" });
    await expect(nav.getByLabel("1 conversa com novidades")).toBeVisible();
    const item = page.getByRole("list", { name: "Conversas" }).getByRole("link").first();
    await expect(item).toContainText(name);
    await expect(item).toContainText("上海测试贸易");
    await expect(item.getByText("Nova")).toBeVisible();
    await expect(item.getByText("Aguardando resposta")).toBeVisible();
    await item.click();

    // 4. Tradução em português, original acessível, copiloto com pendências
    const thread = page.getByRole("region", { name: "Mensagens da conversa" });
    await expect(thread.getByText(/Tradução de teste.*500.*Xangai/)).toBeVisible({ timeout: 30_000 });
    await thread.getByText("Ver original").click();
    await expect(thread.getByText(QUESTION)).toBeVisible();
    const copilot = page.getByRole("complementary", { name: "Copiloto" });
    const pending = copilot.getByRole("list", { name: "Pendências" });
    await expect(pending.getByText("Capacidade de produção")).toBeVisible();
    await expect(pending.getByText("Frete e prazo")).toBeVisible();
    await copilot.getByText("Ver análise").click();
    await expect(copilot.getByText("Volume: 700 mL por garrafa")).toBeVisible();
    // Abrir a conversa marca a entrada exibida como lida
    await expect(nav.getByLabel(/com novidades/)).toHaveCount(0);

    // 5. Sugestão só preenche o editor; a prévia da tradução aparece sozinha
    const reply = page.getByRole("region", { name: "Sua resposta" });
    const send = reply.getByRole("button", { name: "Confirmar envio" });
    await expect(send).toBeDisabled();
    await reply.getByRole("button", { name: "Usar resposta sugerida" }).click();
    const editor = reply.getByLabel("Texto em português");
    await expect(editor).toHaveValue(/Obrigado pelo interesse/);
    await expect(editor).toBeFocused();
    await expect(reply.getByText(/^【测试译文】/)).toBeVisible();
    await expect(send).toBeEnabled();
    await buyer.reload();
    await expect(buyer.getByText("巴西生产者")).toHaveCount(0);

    // 6. Editar invalida a prévia na hora; a nova tradução chega sozinha
    await editor.fill("Obrigado! Cada garrafa tem 700 mL. Vou confirmar a produção de 600 garrafas e o frete até Xangai.");
    await expect(send).toBeDisabled();
    const preview = reply.getByText(/^【测试译文】/);
    await expect(preview).toContainText("600");
    await expect(preview).toContainText("700");
    await expect(send).toBeEnabled();

    // 7. Confirma o envio
    await send.click();
    await expect(page.getByText("Resposta enviada ao comprador em chinês.")).toBeVisible();
    await expect(editor).toHaveValue("");
    await expect(thread.getByText(/Vou confirmar a produção de 600 garrafas e o frete até Xangai/)).toBeVisible();

    // 8. Comprador volta pelo link privado: uma única resposta, em chinês
    const back = await phone.newPage();
    await back.goto(privateLink);
    const replies = back.getByRole("listitem").filter({ hasText: "巴西生产者" });
    await expect(replies).toHaveCount(1);
    await expect(replies.first()).toContainText("【测试译文】");
    await expect(replies.first()).toContainText("600");
    await expect(replies.first().locator('[lang="zh-Hans"]').first()).toBeVisible();
    await expect(back.getByText(/留言已送达/)).toHaveCount(0);
    // Análises do produtor nunca chegam ao comprador
    await expect(back.getByText(/Capacidade de produção|Copiloto|Tradução de teste/)).toHaveCount(0);
    await expectNoHorizontalScroll(back);

    // 9. A vitrine oferece retornar à conversa neste aparelho
    await back.goto(new URL(link).pathname);
    await expect(back.getByRole("link", { name: "继续之前的对话" })).toHaveAttribute("href", new URL(privateLink).pathname + new URL(privateLink).hash);
  } finally {
    await cleanupStoreOf(producer);
    await producer.close();
    await phone.close();
  }
});

test("link privado incompleto mostra aviso em chinês", async ({ page }) => {
  await page.goto("/conversa");
  await expect(page.getByRole("heading", { name: "未找到该对话" })).toBeVisible();
  await page.goto("/conversa#t=abc");
  await expect(page.getByRole("heading", { name: "未找到该对话" })).toBeVisible();
});
