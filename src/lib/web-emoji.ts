/**
 * Emoji slots used across the website. Admins change these from the Telegram
 * bot with /setemoji -> Website emojis; values are stored in Firebase under
 * telegramEmoji/keys and read live by the site.
 */
export const WEB_EMOJI_SLOTS: Record<string, { label: string; char: string }> = {
  "web.home": { label: "Home tab", char: "🏠" },
  "web.shop": { label: "Shop tab", char: "🛍️" },
  "web.cart": { label: "Cart tab", char: "🛒" },
  "web.orders": { label: "Orders tab", char: "📦" },
  "web.profile": { label: "Profile tab", char: "👤" },
  "web.bell": { label: "Notification bell", char: "🔔" },
  "web.admin": { label: "Admin panel", char: "🛠️" },
  "web.search": { label: "Search box", char: "🔍" },
  "web.flash": { label: "Flash sale", char: "⚡" },
  "web.gift": { label: "Refer & earn", char: "🎁" },
  "web.code": { label: "Referral code", char: "🤩" },
  "web.link": { label: "Website link", char: "🔗" },
  "web.bot": { label: "Bot link", char: "🤖" },
  "web.users": { label: "Total referrals", char: "👥" },
  "web.wallet": { label: "Wallet & deposits", char: "💳" },
  "web.key": { label: "Reseller API key", char: "🔑" },
  "web.idea": { label: "Request a product", char: "💡" },
  "web.bag": { label: "Product placeholder", char: "🛍️" },
  "web.party": { label: "Order delivered", char: "🎉" },
  "web.ok": { label: "Order received", char: "✅" },
  "web.fail": { label: "Failed / cancelled", char: "❌" },
  "web.price": { label: "Price", char: "💵" },
  "web.stock": { label: "Stock", char: "📦" },
  "web.sold": { label: "Total sold", char: "🔥" },
  "web.new": { label: "New item", char: "🆕" },
  "web.sale": { label: "Discount tag", char: "🏷️" },
  "web.star": { label: "Reviews star", char: "⭐" },
  "web.support": { label: "Support", char: "🎧" },
  "web.secure": { label: "Secure payment", char: "🔒" },
  "web.fast": { label: "Instant delivery", char: "⚡" },
  "web.clock": { label: "Manual delivery", char: "🕐" },
  "web.wait": { label: "Pending", char: "⏳" },
  "web.plus": { label: "Deposit", char: "➕" },
  "web.minus": { label: "Withdraw", char: "➖" },
  "web.card": { label: "Card / UPI payment", char: "💳" },
  "web.coin": { label: "Crypto payment", char: "🪙" },
  "web.copy": { label: "Copy button", char: "📋" },
  "web.warn": { label: "Warning notice", char: "⚠️" },
  "web.info": { label: "Info notice", char: "ℹ️" },
  "web.mail": { label: "Email", char: "📧" },
  "web.phone": { label: "Phone / WhatsApp", char: "📱" },
  "web.crown": { label: "Owner badge", char: "👑" },
  "web.chart": { label: "Dashboard / stats", char: "📈" },
  "web.receipt": { label: "Order receipt", char: "🧾" },
  "web.trophy": { label: "Top seller", char: "🏆" },
};

export type WebEmojiMap = Record<string, { char?: string; id?: string; img?: string }>;

/** Resolve a website emoji, falling back to the built-in default. */
export function webEmoji(map: WebEmojiMap | null | undefined, key: string): string {
  return map?.[key]?.char || WEB_EMOJI_SLOTS[key]?.char || "";
}

/** Image of the premium emoji the admin picked, when one was captured. */
export function webEmojiImg(map: WebEmojiMap | null | undefined, key: string): string {
  return map?.[key]?.img || "";
}

/**
 * The same emoji can show in many places, not only the slot it was set on.
 * This maps a built-in character to what the admin chose (character + artwork)
 * so every appearance on the website follows the admin's choice.
 */
export function buildEmojiCharMap(
  map: WebEmojiMap | null | undefined,
  imgs: Record<string, string> | null | undefined,
): Record<string, { char: string; img?: string }> {
  const out: Record<string, { char: string; img?: string }> = {};
  for (const [key, def] of Object.entries(WEB_EMOJI_SLOTS)) {
    const saved = map?.[key];
    if (!saved?.char && !saved?.img && !imgs?.[key]) continue;
    out[def.char] = { char: saved?.char || def.char, img: imgs?.[key] || saved?.img || "" };
  }
  for (const [key, saved] of Object.entries(map || {})) {
    const img = imgs?.[key] || saved?.img || "";
    if (saved?.char && img) out[saved.char] = { char: saved.char, img };
  }
  return out;
}

const EMOJI_RE = /\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

/** Split text into plain pieces and emojis so artwork can be rendered inline. */
export function splitEmojiText(text: string): { text?: string; emoji?: string }[] {
  const parts: { text?: string; emoji?: string }[] = [];
  let last = 0;
  for (const m of String(text || "").matchAll(EMOJI_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push({ text: text.slice(last, i) });
    parts.push({ emoji: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
