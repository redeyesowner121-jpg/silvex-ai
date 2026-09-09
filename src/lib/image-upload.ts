/** Turn a picked image file into a small compressed 16:6 data URL we can store. */
export async function fileToCompressedDataUrl(file: File, maxSize = 800): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("That image could not be opened."));
    el.src = dataUrl;
  });

  // Always output a 16:6 picture, cropping the middle of the original.
  const outW = Math.min(maxSize, Math.max(320, img.width));
  const outH = Math.round((outW * 6) / 16);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);

  const srcRatio = img.width / img.height;
  const dstRatio = 16 / 6;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (srcRatio > dstRatio) {
    sw = img.height * dstRatio;
    sx = (img.width - sw) / 2;
  } else if (srcRatio < dstRatio) {
    sh = img.width / dstRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  const out = canvas.toDataURL("image/jpeg", 0.82);
  if (out.length > 900_000) throw new Error("That image is too large, try a smaller one.");
  return out;
}
