import { defineConfig } from "@playwright/test";

/**
 * Ensaio com a IA real contra um servidor já em execução (local ou Vercel).
 *   ENSAIO_URL=http://localhost:3000 npx playwright test -c playwright.ensaio.config.ts
 * Gasta cota do Gemini (cerca de 8 chamadas). Remove as lojas criadas ao final,
 * exceto com ENSAIO_MANTER=1.
 */
export default defineConfig({
  testDir: "tests/ensaio",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results/ensaio",
  use: {
    baseURL: process.env.ENSAIO_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
