/** Server-only helpers for the Telegram bot + Firebase Realtime Database REST access. */
import { createHash, timingSafeEqual } from "crypto";
import { isOriginProject } from "./origin";
import { hasPremiumEmoji, htmlToEntities, stripPremiumEmojiTags, type TgEntity } from "./telegram-entities";

/** Database URL: set FIREBASE_DATABASE_URL when remixing to another project. */
const DEFAULT_RTDB_URL = "https://silvex-ai-default-rtdb.firebaseio.com";
export const rtdbUrl = () =>
  (process.env["FIREBASE_DATABASE_URL"] || DEFAULT_RTDB_URL).replace(/\/+$/, "");
export const RTDB_URL = DEFAULT_RTDB_URL;

/** Fallbacks of the original store only — a new database starts empty. */
const DEFAULT_SITE_URL = "https://silvex-ai.com";
const DEFAULT_OWNER_IDS = [7926443195, 6898461453];

let runtimeSiteUrl = "";
let runtimeOwnerIds: number[] = [];

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
export const siteUrl = () =>
  runtimeSiteUrl || (isOriginProject() ? DEFAULT_SITE_URL : process.env["SITE_URL"] || "");
export const ownerIds = () =>
  runtimeOwnerIds.length ? runtimeOwnerIds : isOriginProject() ? DEFAULT_OWNER_IDS : [];



const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

/**
 * Read a setting from the hosting environment at the moment it is needed.
 * Going through globalThis keeps the value out of the build, so changing it on
 * the host takes effect on the next restart without rebuilding the site.
 */
function envVar(name: string): string {
  const env = (globalThis as any)?.process?.env;
  const v = env ? env[name] : undefined;
  return typeof v === "string" ? v.trim() : "";
}

/** Bot token set in the admin panel (preferred) or in the project secrets. */
export function botToken(): string {
  return runtimeBotToken || envVar("TELEGRAM_BOT_TOKEN");
}

/** Where to send Bot API calls: the admin token first, the linked bot otherwise. */
export function tgApi(method: string): { url: string; headers: Record<string, string> } | null {
  const token = botToken();
  if (token) return { url: `https://api.telegram.org/bot${token}/${method}`, headers: {} };
  const lovableKey = envVar("LOVABLE_API_KEY");
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
  return envVar("TELEGRAM_API_KEY_1") || envVar("TELEGRAM_API_KEY") || undefined;
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

/** Prepare message text or a caption for both JSON and multipart Telegram calls. */
export function prepareTelegramText(text: string): {
  text: string;
  entities?: TgEntity[];
} {
  const decorated = String(decorateText(text));
  if (!hasPremiumEmoji(decorated)) return { text: decorated };
  const parsed = htmlToEntities(decorated);
  return parsed || { text: stripPremiumEmojiTags(decorated) };
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
  if (payload["text"]) payload["text"] = decorateText(payload["text"]);
  if (payload["caption"]) payload["caption"] = decorateText(payload["caption"]);

  // Telegram's HTML mode does not render <tg-emoji> on every client, so any
  // message holding a premium emoji is converted to text + entities instead.
  for (const field of ["text", "caption"] as const) {
    const value = payload[field];
    if (!hasPremiumEmoji(value)) continue;
    const parsed = htmlToEntities(String(value));
    if (!parsed) continue;
    payload[field] = parsed.text;
    payload[field === "text" ? "entities" : "caption_entities"] = parsed.entities;
    delete payload["parse_mode"];
  }


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
      const plainText = (v: unknown) => (typeof v === "string" ? stripPremiumEmojiTags(v) : v);
      const retry: Record<string, unknown> = { ...payload };
      if (retry["text"]) retry["text"] = plainText(retry["text"]);
      if (retry["caption"]) retry["caption"] = plainText(retry["caption"]);
      // Custom-emoji entities are what the server refused — drop them as well.
      delete retry["entities"];
      delete retry["caption_entities"];
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
let runtimeLoading: Promise<void> | null = null;

function pullBotRuntime(): Promise<void> {
  runtimeLoading ||= dbGet<any>("site_settings/config")
    .catch(() => null)
    .then(async (c) => {
      runtimeLoadedAt = Date.now();
      applyBotConfig(c);
      const { applyReferralConfig } = await import("./referral");
      applyReferralConfig(c);
    })
    .catch(() => undefined)
    .finally(() => {
      runtimeLoading = null;
    });
  return runtimeLoading;
}

/** Pull the admin-managed settings (site link, owners, referral) into this worker.
 *  Once loaded, later refreshes happen in the background so no message waits. */
export async function loadBotRuntime(force = false): Promise<void> {
  if (force) return pullBotRuntime();
  if (!runtimeLoadedAt) return pullBotRuntime();
  if (Date.now() - runtimeLoadedAt >= 30_000) void pullBotRuntime();
}



async function dbWrite(method: string, path: string, value: unknown): Promise<void> {
  // print=silent: the database replies with nothing instead of echoing the data back.
  const res = await fetch(`${rtdbUrl()}/${path}.json?print=silent`, {
    method,
    body: JSON.stringify(value),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Database write failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

export async function dbPut(path: string, value: unknown): Promise<void> {
  await dbWrite("PUT", path, value);
}

/**
 * Atomically creates a database value only when that path is still empty.
 * Firebase's ETag precondition makes this safe when webhooks and button taps
 * reach different server instances at exactly the same time.
 */
export async function dbCreateIfAbsent(path: string, value: unknown): Promise<boolean> {
  const url = `${rtdbUrl()}/${path}.json`;
  const current = await fetch(url, { headers: { "X-Firebase-ETag": "true" } });
  if (!current.ok) throw new Error(`Database claim read failed (${current.status})`);
  const existing = await current.json();
  if (existing !== null) return false;
  const etag = current.headers.get("etag");
  if (!etag) throw new Error("Database claim did not return an ETag");

  // Firebase rejects print=silent together with if-match, so no query here.
  const claimed = await fetch(url, {
    method: "PUT",
    headers: { "If-Match": etag, "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (claimed.status === 412) return false;
  if (!claimed.ok) {
    const detail = await claimed.text().catch(() => "");
    throw new Error(`Database claim failed (${claimed.status}): ${detail.slice(0, 200)}`);
  }
  return true;
}

export async function dbPatch(path: string, value: Record<string, unknown>): Promise<void> {
  await dbWrite("PATCH", path, value);
}

export async function dbPush(path: string, value: unknown): Promise<void> {
  await fetch(`${rtdbUrl()}/${path}.json?print=silent`, {
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


import { plainEmojiText } from "@/lib/bot/delivery-files.server";
export {
  plainEmojiText,
  buildDeliveryPdf,
  buildDeliverySvg,
  tgSendDocument,
  sendDeliveryFiles,
} from "@/lib/bot/delivery-files.server";

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
        const prepared = prepareTelegramText(caption);
        form.append("caption", prepared.text);
        if (prepared.entities) form.append("caption_entities", JSON.stringify(prepared.entities));
        else form.append("parse_mode", "HTML");
      }
      if (keyboard) form.append("reply_markup", JSON.stringify(decorateMarkup(keyboard)));
      const ext = (m[1] || "image/jpeg").split("/")[1]?.split("+")[0] || "jpg";
      form.append("photo", new Blob([bytes as unknown as BlobPart], { type: m[1] || "image/jpeg" }), `photo.${ext}`);
      const res = await fetch(api.url, { method: "POST", headers: api.headers, body: form });
      if (!res.ok) {
        const detail = await res.text();
        console.error(`Telegram sendPhoto failed [${res.status}]: ${detail}`);
        // Retry without premium emoji markup so the photo still reaches the buyer.
        if (caption && /emoji|entit/i.test(detail)) {
          form.set("caption", plainEmojiText(String(decorateText(caption))));
          form.delete("caption_entities");
          form.set("parse_mode", "HTML");
          const retry = await fetch(api.url, { method: "POST", headers: api.headers, body: form });
          if (retry.ok) return true;
        }
        return false;
      }
      return true;
    }
    if (!/^https?:\/\//i.test(photo.trim())) return false;
    await tg("sendPhoto", {
      chat_id: chatId,
      photo: photo.trim(),
      ...(caption ? { caption: String(decorateText(caption)), parse_mode: "HTML" } : {}),
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
export async function tgFileDataUrl(fileId: string, maxBytes = 1_500_000): Promise<string | null> {
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
      ext === "png"
        ? "image/png"
        : ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "webm"
            ? "video/webm"
            : ext === "tgs"
              ? "application/x-tgsticker"
              : "image/webp";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
