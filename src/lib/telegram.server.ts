/** Server-only helpers for the Telegram bot + Firebase Realtime Database REST access. */
import { createHash, timingSafeEqual } from "crypto";

export const RTDB_URL = "https://silvex-ai-default-rtdb.firebaseio.com";
export const SITE_URL = "https://silvex-ai.lovable.app";
export const TELEGRAM_OWNER_IDS = [7926443195, 6898461453];

const GATEWAY = "https://connector-gateway.lovable.dev/telegram";

export async function tg(method: string, body: Record<string, unknown>): Promise<any> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connKey = process.env["TELEGRAM_API_KEY"];
  if (!lovableKey || !connKey) throw new Error("Telegram connection is not configured");
  const res = await fetch(`${GATEWAY}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Telegram ${method} failed [${res.status}]: ${text}`);
  const json = JSON.parse(text);
  if (json?.ok === false) throw new Error(`Telegram ${method} error: ${json.description}`);
  return json;
}

export function telegramWebhookSecret(): string {
  const connKey = process.env["TELEGRAM_API_KEY"] || "";
  return createHash("sha256").update(`telegram-webhook:${connKey}`).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/* ---------------- Realtime Database (REST) ---------------- */

export async function dbGet<T = any>(path: string): Promise<T | null> {
  const res = await fetch(`${RTDB_URL}/${path}.json`);
  if (!res.ok) return null;
  return (await res.json()) as T | null;
}

export async function dbPut(path: string, value: unknown): Promise<void> {
  await fetch(`${RTDB_URL}/${path}.json`, {
    method: "PUT",
    body: JSON.stringify(value),
  });
}

export async function dbPatch(path: string, value: Record<string, unknown>): Promise<void> {
  await fetch(`${RTDB_URL}/${path}.json`, {
    method: "PATCH",
    body: JSON.stringify(value),
  });
}

export async function dbPush(path: string, value: unknown): Promise<void> {
  await fetch(`${RTDB_URL}/${path}.json`, {
    method: "POST",
    body: JSON.stringify(value),
  });
}

export function money(n: number): string {
  return `$${Number(n || 0).toFixed(2)}`;
}

export async function notifyOwners(text: string): Promise<void> {
  await Promise.all(
    TELEGRAM_OWNER_IDS.map((id) =>
      tg("sendMessage", { chat_id: id, text, parse_mode: "HTML" }).catch(() => undefined),
    ),
  );
}
