/** Server-only helpers for the Telegram bot + Firebase Realtime Database REST access. */
import { createHash, timingSafeEqual } from "crypto";

/** Database URL: set FIREBASE_DATABASE_URL when remixing to another project. */
const DEFAULT_RTDB_URL = "https://silvex-ai-default-rtdb.firebaseio.com";
export const rtdbUrl = () =>
  (process.env["FIREBASE_DATABASE_URL"] || DEFAULT_RTDB_URL).replace(/\/+$/, "");
export const RTDB_URL = DEFAULT_RTDB_URL;

/** Fallbacks only — the web admin panel overrides these from site_settings/config. */
const DEFAULT_SITE_URL = "https://silvex-ai.com";
const DEFAULT_OWNER_IDS = [7926443195, 6898461453];

let runtimeSiteUrl = DEFAULT_SITE_URL;
let runtimeOwnerIds = DEFAULT_OWNER_IDS;

let runtimeBotToken = "";

export function applyBotConfig(
  c?: { siteUrl?: string; telegramOwners?: string | number[]; botToken?: string } | null,
) {
  if (!c) return;
  if (c.botToken !== undefined) runtimeBotToken = String(c.botToken ?? "").trim();
  if (c.siteUrl) runtimeSiteUrl = String(c.siteUrl).trim().replace(/\/+$/, "");
  const raw = c.telegramOwners;
  const ids = (Array.isArray(raw) ? raw : String(raw ?? "").split(/[,\s]+/))
    .map((v) => Number(String(v).trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length) runtimeOwnerIds = ids;
}

export const SITE_URL_DEFAULT = DEFAULT_SITE_URL;
export const siteUrl = () => runtimeSiteUrl;
export const ownerIds = () => runtimeOwnerIds;


const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

/** Bot token set in the admin panel (preferred) or in the project secrets. */
export function botToken(): string {
  return runtimeBotToken || process.env["TELEGRAM_BOT_TOKEN"] || "";
}

/** Where to send Bot API calls: the admin token first, the linked bot otherwise. */
export function tgApi(method: string): { url: string; headers: Record<string, string> } | null {
  const token = botToken();
  if (token) return { url: `https://api.telegram.org/bot${token}/${method}`, headers: {} };
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = telegramConnectionKey();
  if (!lovableKey || !connKey) return null;
  return {
    url: `${GATEWAY}/${method}`,
    headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connKey },
  };
}

/** Download URL for a Telegram file path. */
export function tgFileUrl(path: string): { url: string; headers: Record<string, string> } | null {
  const token = botToken();
  if (token) return { url: `https://api.telegram.org/file/bot${token}/${path}`, headers: {} };
  const api = tgApi(`file/${path}`);
  return api;
}

/** Latest linked Telegram connection key (newest slot wins). */
export function telegramConnectionKey(): string | undefined {
  return (
    process.env["TELEGRAM_API_KEY_1"] ||
    process.env["TELEGRAM_API_KEY"] ||
    undefined
  );
}

/* ---------------- inline button styling ---------------- */

/**
 * Bot API 10.3 gives inline buttons a `style` ("primary" | "success" | "danger")
 * and an `icon_custom_emoji_id` (premium emoji icon). The emoji registry plugs a
 * decorator in here so every keyboard we send gets coloured automatically.
 */
type KeyboardDecorator = (markup: any) => any;
let keyboardDecorator: KeyboardDecorator = (m) => m;

export function setKeyboardDecorator(fn: KeyboardDecorator): void {
  keyboardDecorator = fn;
}

export function decorateMarkup(markup: any): any {
  if (!markup || !Array.isArray(markup.inline_keyboard)) return markup;
  try {
    return keyboardDecorator(markup);
  } catch {
    return markup;
  }
}

/**
 * Emoji chosen by the admin must apply everywhere the same emoji appears, not
 * only on the one button it was picked for. The emoji registry plugs a text
 * decorator in here so every outgoing message/caption is upgraded.
 */
type TextDecorator = (text: string) => string;
let textDecorator: TextDecorator = (t) => t;

export function setTextDecorator(fn: TextDecorator): void {
  textDecorator = fn;
}

export function decorateText(text: unknown): unknown {
  if (typeof text !== "string" || !text) return text;
  try {
    return textDecorator(text);
  } catch {
    return text;
  }
}


/** Drop premium icons if Telegram refuses them for this bot. */
function stripIcons(markup: any): any {
  if (!markup || !Array.isArray(markup.inline_keyboard)) return markup;
  return {
    ...markup,
    inline_keyboard: markup.inline_keyboard.map((row: any[]) =>
      row.map(({ icon_custom_emoji_id, ...rest }: any) => rest),
    ),
  };
}

export async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const api = tgApi(method);
  if (!api) throw new Error("Telegram bot is not configured. Add the bot token in the admin panel.");
  const payload: Record<string, unknown> = { ...body };
  if (payload["reply_markup"]) payload["reply_markup"] = decorateMarkup(payload["reply_markup"]);

  const call = async (data: Record<string, unknown>) => {
    const res = await fetch(api.url, {
      method: "POST",
      headers: { ...api.headers, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`Telegram ${method} failed [${res.status}]: ${text}`);
    const json = JSON.parse(text);
    if (json?.ok === false) throw new Error(`Telegram ${method} error: ${json.description}`);
    return json;
  };

  try {
    return await call(payload);
  } catch (err) {
    const msg = String((err as Error)?.message || "");
    // Bots without a Fragment username / premium owner can't use premium icons,
    // and older clients may reject the style field — retry plain instead of failing.
    if (/custom_emoji|CUSTOM_EMOJI|icon|style|entit/i.test(msg)) {
      // Premium emoji in message text also needs a Fragment-linked bot — fall
      // back to the plain emoji characters rather than dropping the message.
      const plainText = (v: unknown) =>
        typeof v === "string" ? v.replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, "$1") : v;
      const retry: Record<string, unknown> = { ...payload };
      if (retry["text"]) retry["text"] = plainText(retry["text"]);
      if (retry["caption"]) retry["caption"] = plainText(retry["caption"]);
      if (retry["reply_markup"]) {
        const plain = stripIcons(retry["reply_markup"]);
        retry["reply_markup"] = {
          ...plain,
          inline_keyboard: plain.inline_keyboard.map((row: any[]) => row.map(({ style, ...r }: any) => r)),
        };
      }
      return await call(retry);
    }
    throw err;

  }
}


function secretFor(key: string): string {
  return createHash("sha256").update(`telegram-webhook:${key}`).digest("base64url");
}

/** Secret we register with Telegram for the bot currently in use. */
export function telegramWebhookSecret(): string {
  return secretFor(botToken() || telegramConnectionKey() || "");
}

/** Accept the secret of either the admin token or the linked bot connection. */
export function telegramWebhookOk(actual: string): boolean {
  const keys = [botToken(), telegramConnectionKey() || ""].filter(Boolean);
  return keys.some((k) => safeEqual(actual, secretFor(k)));
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/* ---------------- Realtime Database (REST) ---------------- */

export async function dbGet<T = any>(path: string): Promise<T | null> {
  const res = await fetch(`${rtdbUrl()}/${path}.json`);
  if (!res.ok) return null;
  return (await res.json()) as T | null;
}

let runtimeLoadedAt = 0;

/** Pull the admin-managed settings (site link, owners, referral) into this worker. */
export async function loadBotRuntime(force = false): Promise<void> {
  if (!force && Date.now() - runtimeLoadedAt < 30_000) return;
  const c = await dbGet<any>("site_settings/config").catch(() => null);
  runtimeLoadedAt = Date.now();
  applyBotConfig(c);
  const { applyReferralConfig } = await import("./referral");
  applyReferralConfig(c);
}



async function dbWrite(method: string, path: string, value: unknown): Promise<void> {
  const res = await fetch(`${rtdbUrl()}/${path}.json`, { method, body: JSON.stringify(value) });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Database write failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

export async function dbPut(path: string, value: unknown): Promise<void> {
  await dbWrite("PUT", path, value);
}

export async function dbPatch(path: string, value: Record<string, unknown>): Promise<void> {
  await dbWrite("PATCH", path, value);
}

export async function dbPush(path: string, value: unknown): Promise<void> {
  await fetch(`${rtdbUrl()}/${path}.json`, {
    method: "POST",
    body: JSON.stringify(value),
  });
}

export function money(n: number): string {
  return `$${Number(n || 0).toFixed(2)}`;
}

export async function notifyOwners(text: string): Promise<void> {
  await Promise.all(
    ownerIds().map((id) =>
      tg("sendMessage", { chat_id: id, text, parse_mode: "HTML" }).catch(() => undefined),
    ),
  );
}

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
    form.append("caption", caption);
    form.append("parse_mode", "HTML");
  }
  form.append("document", new Blob([bytes as unknown as BlobPart], { type: mime }), filename);
  const res = await fetch(api.url, { method: "POST", headers: api.headers, body: form });
  if (!res.ok) console.error(`Telegram sendDocument failed [${res.status}]: ${await res.text()}`);
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

/* ---------------- photos ---------------- */

/** Send a product photo. Accepts an http(s) URL or a data: URL (uploaded image). */
export async function tgSendPhoto(
  chatId: number,
  photo: string,
  caption?: string,
  keyboard?: unknown,
): Promise<boolean> {
  try {
    const m = /^data:([^;,]+);base64,(.*)$/i.exec(photo.trim());
    if (m) {
      const api = tgApi("sendPhoto");
      if (!api) return false;
      const bytes = Buffer.from(m[2]!, "base64");
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (caption) {
        form.append("caption", caption);
        form.append("parse_mode", "HTML");
      }
      if (keyboard) form.append("reply_markup", JSON.stringify(decorateMarkup(keyboard)));
      const ext = (m[1] || "image/jpeg").split("/")[1]?.split("+")[0] || "jpg";
      form.append("photo", new Blob([bytes as unknown as BlobPart], { type: m[1] || "image/jpeg" }), `photo.${ext}`);
      const res = await fetch(api.url, { method: "POST", headers: api.headers, body: form });
      if (!res.ok) {
        console.error(`Telegram sendPhoto failed [${res.status}]: ${await res.text()}`);
        return false;
      }
      return true;
    }
    if (!/^https?:\/\//i.test(photo.trim())) return false;
    await tg("sendPhoto", {
      chat_id: chatId,
      photo: photo.trim(),
      ...(caption ? { caption, parse_mode: "HTML" } : {}),
      ...(keyboard ? { reply_markup: decorateMarkup(keyboard) } : {}),
    });
    return true;
  } catch (e) {
    console.error("sendPhoto error", e);
    return false;
  }
}

/* ---------------- file download ---------------- */

/** Download a Telegram file (by file_id) and return it as a data: URL. */
export async function tgFileDataUrl(fileId: string, maxBytes = 400_000): Promise<string | null> {
  try {
    const info = await tg("getFile", { file_id: fileId });
    const path = info?.result?.file_path;
    if (!path) return null;
    const file = tgFileUrl(String(path));
    if (!file) return null;
    const res = await fetch(file.url, { headers: file.headers });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > maxBytes) return null;
    const ext = String(path).split(".").pop()?.toLowerCase() || "webp";
    const mime =
      ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webm" ? "video/webm" : "image/webp";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
