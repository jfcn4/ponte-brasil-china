/**
 * Prepara a foto no navegador antes do envio: corrige a orientação, limita o
 * maior lado a 2000 px e regrava em JPEG. Isso mantém o arquivo abaixo do
 * limite de upload e remove metadados EXIF, inclusive localização.
 */
const MAX_SIDE = 2000;
const QUALITY = 0.86;
export const MAX_ORIGINAL_BYTES = 40 * 1024 * 1024;

export class ImagePrepError extends Error {}

export async function prepareImage(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.size > MAX_ORIGINAL_BYTES) {
    throw new ImagePrepError("Esta foto passa de 40 MB. Escolha uma imagem menor.");
  }
  const looksLikeImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!looksLikeImage) {
    throw new ImagePrepError("Formato não aceito. Envie uma foto em JPG, PNG ou WebP.");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImagePrepError("Não foi possível ler esta foto neste navegador. Envie em JPG, PNG ou WebP.");
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImagePrepError("Não foi possível processar a foto neste navegador.");
  ctx.fillStyle = "#ffffff"; // fundos transparentes (PNG) viram branco no JPEG
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new ImagePrepError("Não foi possível processar a foto neste navegador.");
  return { blob, width, height };
}
