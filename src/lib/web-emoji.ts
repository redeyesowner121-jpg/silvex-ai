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
