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

/** Bot button / message emoji slots (shared so the website can match them too). */
export const BOT_EMOJI_SLOTS: Record<string, { label: string; char: string; group: "button" | "normal" }> = {
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
  "norm.warn": { label: "Warning", char: "⚠️", group: "normal" },
  "norm.info": { label: "Info", char: "ℹ️", group: "normal" },
  "norm.wait": { label: "Pending", char: "⏳", group: "normal" },
  "norm.party": { label: "Delivered", char: "🎉", group: "normal" },
  "norm.link": { label: "Link", char: "🔗", group: "normal" },
  "norm.mail": { label: "Email", char: "📧", group: "normal" },
  "norm.phone": { label: "Phone / WhatsApp", char: "📱", group: "normal" },
  "norm.receipt": { label: "Receipt", char: "🧾", group: "normal" },
  "norm.card": { label: "Card / UPI", char: "💳", group: "normal" },
  "norm.coin": { label: "Crypto", char: "🪙", group: "normal" },
  "norm.gift": { label: "Referral gift", char: "🎁", group: "normal" },
  "norm.users": { label: "Referrals", char: "👥", group: "normal" },
  "norm.user": { label: "Profile", char: "👤", group: "normal" },
  "norm.chart": { label: "Stats", char: "📈", group: "normal" },
  "norm.tag": { label: "Discount tag", char: "🏷️", group: "normal" },
  "norm.fire": { label: "Hot / sold", char: "🔥", group: "normal" },
  "norm.new": { label: "New item", char: "🆕", group: "normal" },
  "norm.crown": { label: "Owner", char: "👑", group: "normal" },
  "norm.bell": { label: "Notification", char: "🔔", group: "normal" },
  "norm.search": { label: "Search", char: "🔍", group: "normal" },
  "norm.pin": { label: "Note", char: "📌", group: "normal" },
  "btn.home": { label: "Home button", char: "🏠", group: "button" },
  "btn.admin": { label: "Admin button", char: "🛠", group: "button" },
  "btn.settings": { label: "Settings button", char: "⚙️", group: "button" },
  "btn.stats": { label: "Stats button", char: "📊", group: "button" },
  "btn.cancel": { label: "Cancel button", char: "❌", group: "button" },
  "btn.confirm": { label: "Confirm button", char: "✅", group: "button" },
  "btn.refresh": { label: "Refresh button", char: "🔄", group: "button" },
  "btn.next": { label: "Next button", char: "➡️", group: "button" },
  "btn.copy": { label: "Copy button", char: "📋", group: "button" },
  "btn.channel": { label: "Channel button", char: "📣", group: "button" },
  "btn.emoji": { label: "Emoji button", char: "😍", group: "button" },
  "btn.history": { label: "History button", char: "🕘", group: "button" },
  "btn.help": { label: "Help button", char: "❓", group: "button" },
  "btn.edit": { label: "Edit button", char: "✏️", group: "button" },
};

/** One saved replacement: the original emoji -> the emoji the admin picked. */
export type EmojiRule = { from: string; char: string; id?: string };
export type EmojiRuleMap = Record<string, EmojiRule>;

/**
 * "🛍" and "🛍️" are the same emoji to a person but different text, so matching
 * ignores the invisible variation mark.
 */
export const normEmoji = (c: string) => String(c || "").replace(/\uFE0F/g, "");

/** Default character for a named place in the site or bot. */
export const slotChar = (key: string) =>
  WEB_EMOJI_SLOTS[key]?.char || BOT_EMOJI_SLOTS[key]?.char || "";

/**
 * Build "original emoji -> chosen emoji (+ premium artwork)" so one change by
 * the admin applies to every place that emoji is used.
 */
export function buildEmojiCharMap(
  rules: EmojiRuleMap | null | undefined,
  imgs: Record<string, string> | null | undefined,
): Record<string, { char: string; img?: string }> {
  const out: Record<string, { char: string; img?: string }> = {};
  for (const [key, rule] of Object.entries(rules || {})) {
    if (!rule?.from || !rule?.char) continue;
    out[normEmoji(rule.from)] = { char: rule.char, img: imgs?.[key] || "" };
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
