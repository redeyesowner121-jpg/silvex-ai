/** Turn a picked image file into a small data URL we can store. */
export async function fileToCompressedDataUrl(
  file: File,
  maxSize = 800,
  options?: { productImage?: boolean },
): Promise<string> {
  const productImage = options?.productImage === true;
  const allowedProductTypes = ["image/jpeg", "image/png", "image/gif"];
  if (productImage ? !allowedProductTypes.includes(file.type) : !file.type.startsWith("image/")) {
    throw new Error(productImage ? "Please choose a JPG, PNG or GIF image." : "Please choose an image file.");
  }
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

  if (productImage && img.width < 640) {
    throw new Error("Product image must be at least 640 px wide.");
  }

  // Keep animated GIFs intact. Their framing is handled by the 16:9 product viewer.
  if (productImage && file.type === "image/gif") {
    if (dataUrl.length > 900_000) throw new Error("That GIF is too large, try a smaller one.");
    return dataUrl;
  }

  // Product pictures use 16:9 (up to the recommended 1280 × 720).
  const outW = productImage
    ? Math.min(1280, Math.max(640, img.width))
    : Math.min(maxSize, Math.max(320, img.width));
  const ratioHeight = productImage ? 9 : 6;
  const outH = Math.round((outW * ratioHeight) / 16);
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, outW, outH);

  const srcRatio = img.width / img.height;
  const dstRatio = 16 / ratioHeight;
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
