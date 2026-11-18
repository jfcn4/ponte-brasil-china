import { describe, expect, it } from "vitest";
import { choosePublicOrigin, isLoopbackUrl } from "@/lib/origin";

const request = async () => "https://pedido.example";
const origin = async (input: Omit<Parameters<typeof choosePublicOrigin>[0], "requestOrigin">) =>
  choosePublicOrigin({ ...input, requestOrigin: request });

describe("origem dos links e QRs", () => {
  it("usa APP_URL quando é um endereço público ou de rede local", async () => {
    expect((await origin({ appUrl: "https://loja.example/", onVercel: true, productionHost: "x.vercel.app" })).origin).toBe("https://loja.example");
    expect((await origin({ appUrl: "http://192.168.0.10:3000", onVercel: false, productionHost: undefined })).origin).toBe(
      "http://192.168.0.10:3000",
    );
  });

  it("na Vercel ignora APP_URL de localhost e usa o domínio de produção", async () => {
    expect(await origin({ appUrl: "http://localhost:3000", onVercel: true, productionHost: "ponte-brasil-china.vercel.app" })).toEqual({
      origin: "https://ponte-brasil-china.vercel.app",
      ignoredAppUrl: true,
    });
  });

  it("fora da Vercel mantém localhost (desenvolvimento) e cai no host da requisição sem configuração", async () => {
    expect((await origin({ appUrl: "http://localhost:3000", onVercel: false, productionHost: undefined })).origin).toBe("http://localhost:3000");
    expect((await origin({ appUrl: undefined, onVercel: false, productionHost: undefined })).origin).toBe("https://pedido.example");
  });

  it("só lê a requisição quando não há configuração", async () => {
    let read = false;
    await choosePublicOrigin({
      appUrl: "https://loja.example",
      onVercel: false,
      productionHost: undefined,
      requestOrigin: async () => {
        read = true;
        return "x";
      },
    });
    expect(read).toBe(false);
  });

  it("reconhece endereços de loopback", () => {
    expect(isLoopbackUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isLoopbackUrl("http://app.localhost")).toBe(true);
    expect(isLoopbackUrl("https://ponte-brasil-china.vercel.app")).toBe(false);
  });
});
