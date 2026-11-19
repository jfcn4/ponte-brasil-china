import path from "node:path";
import { devices, expect, test, type BrowserContext, type Page } from "@playwright/test";
import { cleanupStoreOf } from "../e2e/helpers";

/**
 * Ensaio da banca com a IA real (Gemini), em três navegadores isolados:
 * produtor A (desktop), comprador (celular) e produtor B (outra sessão).
 * Não roda no `npm run test:e2e`: veja playwright.ensaio.config.ts.
 *
 * ENSAIO_FALHA_URL (opcional) aponta para uma segunda instância da mesma
 * aplicação, no mesmo host, configurada com um modelo inexistente: as chamadas
 * de IA falham de verdade e o ensaio confere a recuperação.
 */

const FIXTURES = path.join(__dirname, "..", "fixtures");
const PHOTO_A = path.join(FIXTURES, "garrafa-teste.jpg");
const PHOTO_B = process.env.ENSAIO_FOTO_B ?? PHOTO_A;
const FAIL_URL = process.env.ENSAIO_FALHA_URL;
const KEEP = process.env.ENSAIO_MANTER === "1";
const AI_TIMEOUT = 120_000;
const QUESTION = "你好，我是上海一家酒类进口公司的采购。我们想先订500瓶，请问能在明年一月前送到上海吗？如果可以，请报一下价格。";
const REPLY_PT =
  "Obrigado! Cada garrafa tem 700 mL. Vou confirmar a produção de 500 garrafas até janeiro e o frete até Xangai. O preço não inclui impostos de importação.";

test.describe.configure({ mode: "serial" });

const stamp = Date.now().toString(36).slice(-4).toUpperCase();
const NAME_1 = `Ensaio Serra Azul ${stamp}`;
const NAME_2 = `Ensaio Ouro Velho ${stamp}`;
const NAME_3 = `Ensaio Lote Novo ${stamp}`;

let producer: BrowserContext;
let phone: BrowserContext;
let other: BrowserContext;
let page: Page;
let buyer: Page;
type Key = "edit1" | "edit2" | "edit3" | "link1" | "link2" | "choice1" | "choice2" | "store" | "private1" | "conversation";
const state = {} as Record<Key, string>;

test.beforeAll(async ({ browser }) => {
  producer = await browser.newContext({ ...devices["Desktop Chrome"], locale: "pt-BR" });
  phone = await browser.newContext({ ...devices["Pixel 7"], locale: "zh-CN" });
  other = await browser.newContext({ ...devices["Desktop Chrome"], locale: "pt-BR" });
  page = await producer.newPage();
  buyer = await phone.newPage();
});

test.afterAll(async () => {
  if (!KEEP) {
    await cleanupStoreOf(producer);
    await cleanupStoreOf(other);
  }
  await producer.close();
  await phone.close();
  await other.close();
});

async function shot(target: Page, name: string) {
  await target.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

async function fillDraft(p: Page, fields: Record<string, string>, photo?: string) {
  await p.goto("/meu-espaco/produtos/novo");
  for (const [label, value] of Object.entries(fields)) {
    await p.getByLabel(label, { exact: false }).first().fill(value);
  }
  if (photo) {
    await p.locator('input[type="file"]').setInputFiles(photo);
    await expect(p.getByText("1 de 3 fotos")).toBeVisible();
  }
  await expect(p.getByRole("status").first()).toContainText("Rascunho salvo");
  return new URL(p.url()).pathname;
}

/** Gera, escolhe a estratégia e publica. Devolve o link público. */
async function generateChooseAndPublish(p: Page, strategy: RegExp, label: string) {
  const started = Date.now();
  await p.getByRole("button", { name: "Gerar apresentação chinesa" }).click();
  await expect(p).toHaveURL(/\/apresentacao/);
  const options = p.getByRole("group", { name: "Escolha o nome" });
  await expect(options.getByRole("radio")).toHaveCount(4, { timeout: AI_TIMEOUT });
  test.info().annotations.push({ type: "tempo", description: `identidade ${label}: ${Date.now() - started} ms` });
  await expect(p.getByText(/^Recomendação:/)).toBeVisible();
  await expect(p.getByText("Resposta de teste")).toHaveCount(0);
  const choice = options.getByRole("radio", { name: strategy });
  await choice.check();
  const choiceLabel = (await choice.evaluate((el) => el.closest("label")?.textContent ?? "")).replace(/\s+/g, " ");
  await shot(p, `lab-${label}`);
  await p.getByRole("button", { name: /^(Re)?[Pp]ublicar vitrine$/ }).click();
  const dialog = p.getByRole("dialog", { name: "Confirmar publicação" });
  await expect(dialog).toBeVisible();
  await shot(p, `confirmar-${label}`);
  await dialog.getByRole("button", { name: "Confirmar publicação" }).click();
  await expect(p.getByRole("status").filter({ hasText: /Versão \d+ publicada/ })).toBeVisible();
  const link = await p.getByLabel("Link público").inputValue();
  expect(link).toMatch(/\/p\/[a-z0-9]{10}$/);
  return { link, choiceLabel };
}

test("1 · duas cachaças publicadas e um rascunho", async () => {
  test.setTimeout(6 * 60_000);
  state.edit1 = await fillDraft(
    page,
    {
      "Nome da cachaça": NAME_1,
      "Descrição curta": "Cachaça de alambique de cobre, descansada 12 meses em amburana, aroma de baunilha e canela.",
      Volume: "700",
      "Teor alcoólico": "40",
      Envelhecimento: "12",
      Madeira: "Amburana",
      "Nome do produtor ou engenho": `Engenho Ensaio ${stamp}`,
      Cidade: "Salinas",
      "Preço de referência": "79,00",
    },
    PHOTO_A,
  );
  const p1 = await generateChooseAndPublish(page, /Semântica/, "produto-1");
  state.link1 = p1.link;
  state.choice1 = p1.choiceLabel;

  state.edit2 = await fillDraft(
    page,
    {
      "Nome da cachaça": NAME_2,
      "Descrição curta": "Cachaça prata de cana orgânica, destilada em alambique e descansada em inox, sabor limpo e herbal.",
      Volume: "750",
      "Teor alcoólico": "42",
      "Nome do produtor ou engenho": `Engenho Ensaio ${stamp}`,
    },
    PHOTO_B,
  );
  const p2 = await generateChooseAndPublish(page, /Fonética/, "produto-2");
  state.link2 = p2.link;
  state.choice2 = p2.choiceLabel;

  state.edit3 = await fillDraft(page, {
    "Nome da cachaça": NAME_3,
    "Descrição curta": "Lote experimental ainda não publicado.",
  });

  await page.goto("/meu-espaco/produtos");
  await expect(page.getByRole("listitem").filter({ hasText: NAME_3 }).getByText("Rascunho", { exact: true })).toBeVisible();
  await shot(page, "painel-produtos");
  await page.goto("/meu-espaco/minha-loja");
  state.store = await page.getByLabel("Link público").inputValue();
  expect(state.store).toMatch(/\/l\/[a-z0-9]{10}$/);
  await shot(page, "minha-loja");
});

test("2 · QR da loja e do produto em outro navegador; reordenar muda o destaque", async () => {
  await buyer.goto(new URL(state.store).pathname);
  const featured = buyer.getByRole("region", { name: "精选推荐" });
  await expect(featured).toContainText(NAME_1);
  await expect(buyer.getByText(NAME_2)).toBeVisible();
  await expect(buyer.getByText(NAME_3)).toHaveCount(0);
  await expect(buyer.getByText("¥90.85").first()).toBeVisible();
  await expect(buyer.getByText("价格面议 · 欢迎询价")).toBeVisible();
  await shot(buyer, "loja-antes");

  await page.goto("/meu-espaco/produtos");
  await page.getByRole("button", { name: `Mover para cima: ${NAME_2}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Ordem salva" })).toBeVisible();
  await page.reload();
  const items = page.getByRole("list", { name: "Produtos da loja, na ordem do catálogo" }).getByRole("listitem");
  await expect(items.first()).toContainText(NAME_2);

  await buyer.reload();
  await expect(buyer.getByRole("region", { name: "精选推荐" })).toContainText(NAME_2);
  await shot(buyer, "loja-depois");

  // Ficha do produto 1 a partir do catálogo abre a consulta do produto certo
  await buyer.getByRole("link").filter({ hasText: NAME_1 }).first().click();
  await expect(buyer).toHaveURL(new RegExp(`${new URL(state.link1).pathname}$`));
  await expect(buyer.getByRole("link", { name: /返回店铺/ })).toBeVisible();
  await buyer.getByRole("button", { name: /询价.*Solicitar cotação/ }).first().click();
  await expect(buyer.getByLabel(/^留言/)).toBeVisible();
  await shot(buyer, "ficha-1-consulta");

  // QR individual do produto 2
  await buyer.goto(new URL(state.link2).pathname);
  await expect(buyer.getByText(NAME_2)).toBeVisible();
  await expect(buyer.getByText(/价格面议|询价/).first()).toBeVisible();
  await shot(buyer, "ficha-2");
});

test("3 · preço ¥90.85 → ¥102.35 só após republicar, no mesmo link", async () => {
  test.setTimeout(4 * 60_000);
  await buyer.goto(new URL(state.link1).pathname);
  await expect(buyer.getByText("¥90.85")).toBeVisible();

  await page.goto("/meu-espaco/produtos");
  await page.getByRole("link", { name: `Editar ${NAME_1}` }).click();
  await page.getByLabel(/Preço de referência/).fill("89,00");
  await expect(page.getByText("参考价格 ¥102.35").first()).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");
  await expect(page.getByText("Alterações pendentes").first()).toBeVisible();

  await buyer.reload();
  await expect(buyer.getByText("¥90.85")).toBeVisible();
  await expect(buyer.getByText("¥102.35")).toHaveCount(0);

  const started = Date.now();
  await page.getByRole("button", { name: "Revisar apresentação e republicar" }).click();
  await expect(page.getByRole("button", { name: "Republicar vitrine" })).toBeVisible({ timeout: AI_TIMEOUT });
  test.info().annotations.push({ type: "tempo", description: `revisão p/ republicar: ${Date.now() - started} ms` });
  await page.getByRole("button", { name: "Republicar vitrine" }).click();
  const dialog = page.getByRole("dialog", { name: "Confirmar publicação" });
  await expect(dialog.getByText("参考价格 ¥102.35")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar publicação" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Versão 2 publicada" })).toBeVisible();
  expect(await page.getByLabel("Link público").inputValue()).toBe(state.link1);

  await buyer.reload();
  await expect(buyer.getByText("¥102.35")).toBeVisible();
  await expect(buyer.getByText("BRL 89.00")).toBeVisible();
  await shot(buyer, "vitrine-republicada");
});

test("4 · consulta em chinês, tradução, copiloto e resposta revisada", async () => {
  test.setTimeout(6 * 60_000);
  await buyer.goto(new URL(state.link1).pathname);
  await buyer.getByRole("button", { name: /询价.*Solicitar cotação/ }).first().click();
  await buyer.getByLabel(/^留言/).fill(QUESTION);
  await buyer.getByLabel("公司（选填）").fill("上海酒业进口（演示）");
  await buyer.getByRole("button", { name: "发送询价" }).click();
  await expect(buyer).toHaveURL(/\/conversa#t=/);
  state.private1 = buyer.url();
  await expect(buyer.getByText(QUESTION)).toBeVisible();
  await shot(buyer, "conversa-comprador-enviada");

  await page.goto("/meu-espaco/mensagens");
  const nav = page.getByRole("navigation", { name: "Meu espaço" });
  await expect(nav.getByLabel("1 conversa com novidades")).toBeVisible();
  const item = page.getByRole("list", { name: "Conversas" }).getByRole("link").first();
  await expect(item).toContainText(NAME_1);
  await expect(item.getByText("Nova")).toBeVisible();
  await expect(item.getByText("Aguardando resposta")).toBeVisible();
  await item.click();
  await expect(page).toHaveURL(/\/meu-espaco\/mensagens\/[0-9a-f-]{36}$/);
  state.conversation = new URL(page.url()).pathname;

  const started = Date.now();
  const thread = page.getByRole("region", { name: "Mensagens da conversa" });
  await expect(thread.getByText("Ver original")).toBeVisible({ timeout: AI_TIMEOUT });
  test.info().annotations.push({ type: "tempo", description: `interpretação: ${Date.now() - started} ms` });
  await expect(thread.getByText(/500/).first()).toBeVisible();
  await expect(thread.getByText(/Xangai/).first()).toBeVisible();
  const copilot = page.getByRole("complementary", { name: "Copiloto" });
  await expect(copilot.getByRole("list", { name: "Pendências" })).toBeVisible();
  await shot(page, "painel-conversa");

  const reply = page.getByRole("region", { name: "Sua resposta" });
  const send = reply.getByRole("button", { name: "Confirmar envio" });
  await reply.getByRole("button", { name: "Usar resposta sugerida" }).click();
  const editor = reply.getByLabel("Sua resposta em português");
  await expect(editor).not.toHaveValue("");
  await buyer.reload();
  await expect(buyer.getByText("巴西生产者")).toHaveCount(0);

  await editor.fill(REPLY_PT);
  await expect(send).toBeDisabled();
  await expect(send).toBeEnabled({ timeout: AI_TIMEOUT });
  const preview = await reply.locator('[lang="zh-Hans"]').first().innerText();
  test.info().annotations.push({ type: "prévia", description: preview });
  expect(preview).toContain("500");
  expect(preview).toContain("700");
  await shot(page, "painel-previa");
  await send.dblclick();
  await expect(page.getByText("Resposta enviada ao comprador em chinês.")).toBeVisible({ timeout: 30_000 });

  await buyer.goto(state.private1);
  const replies = buyer.getByRole("listitem").filter({ hasText: "巴西生产者" });
  await expect(replies).toHaveCount(1);
  await expect(replies.first().locator('[lang="zh-Hans"]').first()).toBeVisible();
  await expect(buyer.getByText(/Capacidade de produção|Copiloto/)).toHaveCount(0);
  await shot(buyer, "conversa-comprador-resposta");
});

test("5a · outra sessão não edita a loja A nem lê conversas alheias", async () => {
  const intruder = await other.newPage();
  await intruder.goto("/meu-espaco/produtos");
  await expect(intruder.getByText("Nenhum produto ainda")).toBeVisible();
  await intruder.goto("/meu-espaco/mensagens");
  await expect(intruder.getByText(NAME_1)).toHaveCount(0);

  const productId = state.edit1.split("/").pop()!;
  await intruder.goto(`/meu-espaco/produtos/${productId}`);
  await expect(intruder.getByRole("heading", { name: "Produto não encontrado neste espaço" })).toBeVisible();
  await intruder.goto(state.conversation);
  await expect(intruder.getByRole("heading", { name: /não encontrada/i })).toBeVisible();
  await expect(intruder.getByText(QUESTION)).toHaveCount(0);

  // A sessão B cria a própria loja e reaproveita um corpo válido do próprio editor
  const ownSave = intruder.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/products");
  await fillDraft(intruder, { "Nome da cachaça": "Loja B", "Descrição curta": "Outra loja." });
  const body = (await ownSave).postDataJSON() as Record<string, unknown>;
  const origin = { origin: new URL(intruder.url()).origin };
  const attacks = [
    await intruder.request.put(`/api/products/${productId}`, { data: { ...body, expectedRevision: 3 }, headers: origin }),
    await intruder.request.post(`/api/products/${productId}/adaptations`, { data: { expectedRevision: 3 }, headers: origin }),
    await intruder.request.post(`/api/products/${productId}/publication`, { data: {}, headers: origin }),
    await intruder.request.get(`/api/products/${productId}/publication`),
  ];
  for (const response of attacks) expect([400, 403, 404, 409]).toContain(response.status());
  expect(attacks.filter((r) => r.status() === 404).length).toBeGreaterThanOrEqual(3);
  await buyer.goto(new URL(state.link1).pathname);
  await expect(buyer.getByText(NAME_1)).toBeVisible();
  const conversationId = state.conversation.split("/").pop()!;
  const read = await intruder.request.get(`/api/conversations/${conversationId}`);
  expect([403, 404]).toContain(read.status());

  // Outro comprador: o link privado só abre a própria conversa
  const otherBuyer = await other.newPage();
  await otherBuyer.goto(new URL(state.link2).pathname);
  await otherBuyer.getByRole("button", { name: /询价.*Solicitar cotação/ }).first().click();
  await otherBuyer.getByLabel(/^留言/).fill("Do you ship 120 bottles to Shenzhen?");
  await otherBuyer.getByRole("button", { name: "发送询价" }).click();
  await expect(otherBuyer).toHaveURL(/\/conversa#t=/);
  await expect(otherBuyer.getByText(QUESTION)).toHaveCount(0);
  await buyer.goto(state.private1);
  await expect(buyer.getByText("Do you ship 120 bottles to Shenzhen?")).toHaveCount(0);
  await intruder.close();
  await otherBuyer.close();
});

test("5b · falha real da IA preserva rascunho e mensagem e permite tentar de novo", async () => {
  test.skip(!FAIL_URL, "ENSAIO_FALHA_URL não configurada");
  test.setTimeout(6 * 60_000);
  const fail = (p: string) => new URL(p, FAIL_URL).toString();
  const productId = state.edit3.split("/").pop()!;

  // Geração da identidade falha; o rascunho fica intacto e a repetição funciona
  await page.goto(fail(`/meu-espaco/produtos/${productId}`));
  await page.locator('input[type="file"]').setInputFiles(PHOTO_A);
  await expect(page.getByText("1 de 3 fotos")).toBeVisible();
  await expect(page.getByRole("status").first()).toContainText("Rascunho salvo");
  await page.getByRole("button", { name: "Gerar apresentação chinesa" }).click();
  await expect(page.getByText("A geração não deu certo.")).toBeVisible({ timeout: AI_TIMEOUT });
  await shot(page, "falha-geracao");
  await page.goto(`/meu-espaco/produtos/${productId}`);
  await expect(page.getByLabel("Nome da cachaça")).toHaveValue(NAME_3);
  await page.goto(`/meu-espaco/produtos/${productId}/apresentacao`);
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("group", { name: "Escolha o nome" }).getByRole("radio")).toHaveCount(4, { timeout: AI_TIMEOUT });

  // Interpretação falha; o original fica visível e a repetição funciona
  const privateUrl = new URL(state.private1);
  await buyer.goto(fail(privateUrl.pathname + privateUrl.hash));
  await buyer.locator("#buyer-reply").fill("另外，你们有礼盒包装吗？大概需要几天发货？");
  await buyer.getByRole("button", { name: "发送", exact: true }).click();
  await expect(buyer.getByText("另外，你们有礼盒包装吗？大概需要几天发货？")).toBeVisible();
  await page.goto(fail(state.conversation));
  const thread = page.getByRole("region", { name: "Mensagens da conversa" });
  await expect(thread.getByText("另外，你们有礼盒包装吗？大概需要几天发货？")).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(thread.getByRole("button", { name: "Tentar novamente" })).toBeVisible({ timeout: AI_TIMEOUT });
  await shot(page, "falha-interpretacao");

  // Tradução da resposta falha; o texto fica no editor
  const reply = page.getByRole("region", { name: "Sua resposta" });
  await reply.getByLabel("Sua resposta em português").fill("Temos caixa de presente. O envio leva cerca de 15 dias.");
  await expect(reply.getByRole("button", { name: "Tentar novamente" })).toBeVisible({ timeout: AI_TIMEOUT });
  await expect(reply.getByLabel("Sua resposta em português")).toHaveValue(/caixa de presente/);
  await shot(page, "falha-traducao");

  // De volta à instância saudável: repetir interpretação e tradução
  await page.goto(state.conversation);
  await thread.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(thread.getByText(/caixa|embalagem|presente/i).first()).toBeVisible({ timeout: AI_TIMEOUT });
});
