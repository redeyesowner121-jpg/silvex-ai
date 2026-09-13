/** Builds and sends delivery receipts (PDF + SVG). */
import { tgApi, decorateText } from "@/lib/telegram.server";

/* ---------------- delivery receipts (PDF + SVG) ---------------- */

function esc(s: string) {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}

function pdfText(s: string) {
  return String(s).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(lines: string[], max = 78): string[] {
  const out: string[] = [];
  for (const line of lines) {
    let rest = line;
    if (!rest) { out.push(""); continue; }
    while (rest.length > max) {
      out.push(rest.slice(0, max));
      rest = rest.slice(max);
    }
    out.push(rest);
  }
  return out;
}

export function buildDeliveryPdf(title: string, lines: string[]): Uint8Array {
  const rows = wrap([title, "", ...lines]);
  let y = 780;
  let content = "BT\n/F1 11 Tf\n14 TL\n";
  content += `1 0 0 1 50 ${y} Tm\n`;
  for (const l of rows) {
    content += `(${pdfText(l)}) Tj\nT*\n`;
    y -= 14;
    if (y < 60) break;
  }
  content += "ET";

  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function buildDeliverySvg(title: string, lines: string[]): Uint8Array {
  const rows = wrap([title, "", ...lines], 62);
  const height = 80 + rows.length * 22;
  const body = rows
    .map((l, i) => `<text x="40" y="${90 + i * 22}" font-family="Helvetica, Arial" font-size="14" fill="#1f2937">${esc(l)}</text>`)
    .join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="${height}" viewBox="0 0 720 ${height}">
<rect width="720" height="${height}" fill="#ffffff"/>
<rect width="720" height="56" fill="#4f46e5"/>
<text x="40" y="36" font-family="Helvetica, Arial" font-size="20" fill="#ffffff">Delivery receipt</text>
${body}
</svg>`;
  return new TextEncoder().encode(svg);
}

/** Premium emoji markup removed, for retries when Telegram rejects it. */
export const plainEmojiText = (v: string) =>
  v.replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, "$1");

export async function tgSendDocument(
  chatId: number,
  filename: string,
  bytes: Uint8Array,
  mime: string,
  caption?: string,
): Promise<void> {
  const api = tgApi("sendDocument");
  if (!api) return;
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) {
    form.append("caption", String(decorateText(caption)));

    form.append("parse_mode", "HTML");
  }
  form.append("document", new Blob([bytes as unknown as BlobPart], { type: mime }), filename);
  const res = await fetch(api.url, { method: "POST", headers: api.headers, body: form });
  if (!res.ok) {
    const detail = await res.text();
    console.error(`Telegram sendDocument failed [${res.status}]: ${detail}`);
    if (caption && /emoji|entit/i.test(detail)) {
      form.set("caption", plainEmojiText(String(decorateText(caption))));
      await fetch(api.url, { method: "POST", headers: api.headers, body: form }).catch(() => undefined);
    }
  }
}

export async function sendDeliveryFiles(
  chatId: number,
  orderId: string,
  items: { title: string; content: string }[],
  extra?: string,
): Promise<void> {
  const lines = [
    `Order: ${orderId}`,
    `Date: ${new Date().toLocaleString()}`,
    "",
    ...items.flatMap((d) => [d.title, d.content, ""]),
    ...(extra ? ["Note:", extra] : []),
  ];
  await tgSendDocument(chatId, `delivery-${orderId}.pdf`, buildDeliveryPdf("Delivery receipt", lines), "application/pdf").catch(
    () => undefined,
  );
  await tgSendDocument(chatId, `delivery-${orderId}.svg`, buildDeliverySvg("Delivery receipt", lines), "image/svg+xml").catch(
    () => undefined,
  );
}
