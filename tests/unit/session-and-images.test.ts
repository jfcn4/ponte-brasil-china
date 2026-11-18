import { describe, expect, it } from "vitest";
import { sniffImageType } from "@/modules/products/repository";
import { generateSessionToken, hashSessionToken, isWellFormedSessionToken } from "@/modules/stores/token";

describe("token da sessão anônima", () => {
  it("gera segredos de 256 bits em base64url, distintos a cada chamada", () => {
    const tokens = new Set(Array.from({ length: 50 }, generateSessionToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(isWellFormedSessionToken(token)).toBe(true);
  });

  it("recusa valores malformados", () => {
    expect(isWellFormedSessionToken(undefined)).toBe(false);
    expect(isWellFormedSessionToken("curto")).toBe(false);
    expect(isWellFormedSessionToken(`${"a".repeat(42)}=`)).toBe(false);
  });

  it("guarda só o hash SHA-256 em hexadecimal, determinístico", async () => {
    const token = generateSessionToken();
    const hash = await hashSessionToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(await hashSessionToken(token));
    expect(hash).not.toContain(token);
  });
});

describe("assinatura de imagem", () => {
  it("reconhece JPEG, PNG e WebP pelos bytes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageType(webp)).toBe("image/webp");
  });

  it("recusa outros formatos mesmo com tipo declarado de imagem", () => {
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
  });
});
