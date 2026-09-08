/** Server-only emoji registry for the Telegram bot and the website. */
import { dbGet, dbPatch, dbPut } from "./telegram.server";
import { WEB_EMOJI_SLOTS } from "./web-emoji";

export type EmojiEntry = { id?: string; char: string };
export type EmojiStore = {
  keys?: Record<string, EmojiEntry>;
  products?: Record<string, EmojiEntry>;
};

export const EMOJI_PATH = "telegramEmoji";

/** Built-in slots the admin can override with premium (custom) emojis. */
export const EMOJI_SLOTS: Record<string, { label: string; char: string; group: "button" | "normal" }> = {
  "btn.products": { label: "Products button", char: "🛍", group: "button" },
  "btn.wallet": { label: "Wallet button", char: "👛", group: "button" },
  "btn.profile": { label: "Profile button", char: "👤", group: "button" },
  "btn.reviews": { label: "Reviews button", char: "⭐", group: "button" },
  "btn.refer": { label: "Refer button", char: "🎁", group: "button" },
  "btn.support": { label: "Support button", char: "🆘", group: "button" },
  "btn.orders": { label: "Orders button", char: "🧾", group: "button" },
  "btn.apikey": { label: "API key button", char: "🔑", group: "button" },
  "btn.website": { label: "Website button", char: "🌐", group: "button" },
  "btn.buy": { label: "Buy button", char: "🛒", group: "button" },
  "btn.back": { label: "Back button", char: "⬅️", group: "button" },
  "btn.deposit": { label: "Deposit button", char: "➕", group: "button" },
  "btn.withdraw": { label: "Withdraw button", char: "➖", group: "button" },
  "norm.welcome": { label: "Welcome title", char: "🎬", group: "normal" },
  "norm.star": { label: "Premium star", char: "🌟", group: "normal" },
  "norm.fast": { label: "Instant delivery", char: "⚡", group: "normal" },
  "norm.secure": { label: "Secure payment", char: "🔒", group: "normal" },
  "norm.support": { label: "24/7 support", char: "🎧", group: "normal" },
  "norm.money": { label: "Price", char: "💵", group: "normal" },
  "norm.box": { label: "Stock", char: "📦", group: "normal" },
  "norm.clock": { label: "Manual delivery", char: "🕐", group: "normal" },
  "norm.ok": { label: "Success", char: "✅", group: "normal" },
  "norm.fail": { label: "Error", char: "❌", group: "normal" },
  "norm.desc": { label: "Description bullet", char: "•", group: "normal" },
};

let store: EmojiStore = {};

export async function loadEmojis(): Promise<void> {
  store = (await dbGet<EmojiStore>(EMOJI_PATH)) || {};
}

function entry(key: string): EmojiEntry {
  const saved = store.keys?.[key];
  if (saved?.char || saved?.id) return { char: saved.char || EMOJI_SLOTS[key]?.char || "•", id: saved.id ?? "" };
  return { char: EMOJI_SLOTS[key]?.char || "•" };
}

function render(e: EmojiEntry): string {
  const char = e.char || "•";
  return e.id ? `<tg-emoji emoji-id="${e.id}">${char}</tg-emoji>` : char;
}

/** Emoji for message text — premium (custom) emoji when the admin set one. */
export function e(key: string): string {
  return render(entry(key));
}

/** Emoji for inline buttons — Telegram buttons only support plain emoji. */
export function be(key: string): string {
  return entry(key).char;
}

export function productEmojiEntry(productId: string): EmojiEntry {
  return store.products?.[productId] || { char: "🛍" };
}

export function productEmoji(productId: string): string {
  return render(productEmojiEntry(productId));
}

export function productEmojiChar(productId: string): string {
  return productEmojiEntry(productId).char || "🛍";
}

/** Pull the first emoji (with custom emoji id when present) out of a Telegram message. */
export function readEmoji(text: string, entities?: any[], sticker?: any): EmojiEntry | null {
  // A premium emoji forwarded as a sticker carries its id directly.
  if (sticker?.custom_emoji_id) {
    return { id: String(sticker.custom_emoji_id), char: String(sticker.emoji || "⭐") };
  }
  const custom = (entities || []).find((x) => x?.type === "custom_emoji" && x?.custom_emoji_id);
  if (custom) {
    // Telegram offsets/lengths are UTF-16 code units, which is exactly how
    // JavaScript string slicing works — splitting by code points broke this.
    const char = text.slice(custom.offset, custom.offset + custom.length) || "⭐";
    return { id: String(custom.custom_emoji_id), char };
  }
  const m = text.match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/u);
  return m ? { char: m[0] } : null;
}

export async function setSlotEmoji(key: string, value: EmojiEntry): Promise<void> {
  store.keys = { ...(store.keys || {}), [key]: value };
  await dbPatch(`${EMOJI_PATH}/keys`, { [key]: value });
}

export async function setProductEmoji(productId: string, value: EmojiEntry): Promise<void> {
  store.products = { ...(store.products || {}), [productId]: value };
  await dbPut(`${EMOJI_PATH}/products/${productId}`, value);
}

export function slotList(group: "button" | "normal"): { key: string; label: string; preview: string }[] {
  const built = Object.entries(EMOJI_SLOTS)
    .filter(([, v]) => v.group === group)
    .map(([key, v]) => ({ key, label: v.label, preview: entry(key).char }));
  if (group !== "normal") return built;
  const auto = Object.keys(store.keys || {})
    .filter((k) => k.startsWith("auto."))
    .map((key) => ({ key, label: `Found: ${entry(key).char}`, preview: entry(key).char }));
  return [...built, ...auto];
}

/** Auto-register any new emoji found in product titles/descriptions so admins can upgrade them. */
export async function collectEmojis(texts: string[]): Promise<void> {
  const found = new Set<string>();
  for (const t of texts) {
    for (const m of String(t || "").matchAll(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu)) {
      found.add(m[0]);
    }
  }
  const known = new Set(Object.values(store.keys || {}).map((v) => v.char));
  for (const v of Object.values(EMOJI_SLOTS)) known.add(v.char);
  const patch: Record<string, EmojiEntry> = {};
  for (const char of found) {
    if (known.has(char)) continue;
    const key = `auto.${[...char].map((c) => c.codePointAt(0)!.toString(16)).join("-")}`;
    if (store.keys?.[key]) continue;
    patch[key] = { char };
  }
  if (!Object.keys(patch).length) return;
  store.keys = { ...(store.keys || {}), ...patch };
  await dbPatch(`${EMOJI_PATH}/keys`, patch);
}
