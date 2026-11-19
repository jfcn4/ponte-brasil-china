import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.server", () => ({ serverEnv: () => ({ DEMO_STORE_SLUGS: " abcde12345, ,XYZ" }) }));

const { isDemoStore, parseDemoStoreSlugs } = await import("@/modules/stores/demo");

describe("loja de demonstração", () => {
  it("aceita só códigos de loja válidos, sem espaços e em minúsculas", () => {
    expect([...parseDemoStoreSlugs(" abcde12345 , ABCDE99999,curto,, ")]).toEqual(["abcde12345", "abcde99999"]);
    expect(parseDemoStoreSlugs(undefined).size).toBe(0);
  });

  it("marca só as lojas listadas na configuração", () => {
    expect(isDemoStore("abcde12345")).toBe(true);
    expect(isDemoStore("zzzzz00000")).toBe(false);
    expect(isDemoStore(null)).toBe(false);
  });
});
