import "server-only";
import QRCode from "qrcode";

const OPTIONS = { errorCorrectionLevel: "M" as const, margin: 2, color: { dark: "#24201f", light: "#ffffff" } };

/** QR em SVG (exibição) e PNG (download para imprimir ou enviar). */
export async function qrFor(url: string): Promise<{ svg: string; pngDataUrl: string }> {
  const [svg, pngDataUrl] = await Promise.all([
    QRCode.toString(url, { ...OPTIONS, type: "svg" }),
    QRCode.toDataURL(url, { ...OPTIONS, width: 768 }),
  ]);
  return { svg, pngDataUrl };
}
