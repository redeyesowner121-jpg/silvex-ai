/**
 * Premium emoji registry for the Telegram bot and the website.
 *
 * One rule only: every place in the bot/website is a named slot (plus one slot
 * per product). The admin assigns a premium emoji to a slot; nothing is ever
 * guessed from the emoji character itself, and no emoji id is hardcoded.
 *
 * Saving verifies the id with Telegram (getCustomEmojiStickers) and stores the
 * canonical unicode fallback, so a stale id can never break a message.
 */
import { dbGet, dbPut, setKeyboardDecorator, setTextDecorator, tg, tgFileDataUrl } from "./telegram.server";
import { stripPremiumEmojiTags, VALID_EMOJI_ID } from "./telegram-entities";
import { BOT_EMOJI_SLOTS, WEB_EMOJI_SLOTS } from "./web-emoji";
import {
  BUTTON_CATALOG,
  buttonKeyFor,
  styleForColor,
  type ButtonColorMap,
} from "./button-colors";

/** One saved override: a verified premium emoji id plus its unicode fallback. */
export type EmojiEntry = { id?: string; char: string; img?: string; label?: string };

export const EMOJI_PATH = "telegramEmoji";

/** Firebase keys cannot contain dots, so slot keys and product ids are encoded. */
export const encKey = (key: string) => key.split(".").join("~");
export const decKey = (key: string) => key.split("~").join(".");
const decodeMap = <T>(map: Record<string, T> | null) =>
  Object.fromEntries(Object.entries(map || {}).map(([k, v]) => [decKey(k), v]));

/** Keep only the current entry fields when old Firebase records are loaded. */
function normalizeEntries(map: Record<string, EmojiEntry> | null): Record<string, EmojiEntry> {
  return Object.fromEntries(
    Object.entries(decodeMap(map)).map(([key, value]) => {
      const fallback = key.startsWith("web.") || key.startsWith("btn.") || key.startsWith("norm.")
        ? slotDefault(key)
        : "🛍";
      return [key, {
        char: String(value?.char || fallback),
        ...(value?.id && VALID_EMOJI_ID.test(String(value.id)) ? { id: String(value.id) } : {}),
        ...(value?.label ? { label: String(value.label) } : {}),
      }];
    }),
  );
}

/** "🛍" and "🛍️" are the same emoji to a person but different text. */
export const normEmoji = (c: string) => String(c || "").replace(/\uFE0F/g, "");

/** Every named place the bot and website can show an emoji in. */
export const EMOJI_SLOTS: Record<string, { label: string; char: string; group: "button" | "normal" | "web" }> = {
  ...Object.fromEntries(
    Object.entries(WEB_EMOJI_SLOTS).map(([key, v]) => [key, { ...v, group: "web" as const }]),
  ),
  ...BOT_EMOJI_SLOTS,
};

type Store = {
  slots: Record<string, EmojiEntry>;
  products: Record<string, EmojiEntry>;
  enabled: boolean;
};

let store: Store = { slots: {}, products: {}, enabled: true };
let loadedAt = 0;
let loading: Promise<void> | null = null;
// Webhook requests can land on different Railway workers. Keep this short so a
// newly saved emoji starts rendering across every worker within a few seconds.
const EMOJI_CACHE_MS = 5_000;

export async function loadEmojis(force = false): Promise<void> {
  if (!force && loadedAt && Date.now() - loadedAt < EMOJI_CACHE_MS) return;
  if (loading) return loading;
  loading = dbGet<{
    slots?: Record<string, EmojiEntry>;
    products?: Record<string, EmojiEntry>;
    enabled?: boolean;
  }>(EMOJI_PATH)
    .then((saved) => {
      store = {
        slots: normalizeEntries(saved?.slots || null),
        products: normalizeEntries(saved?.products || null),
        enabled: saved?.enabled !== false,
      };
      loadedAt = Date.now();
      charMap = null;
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  return loading;
}

export const premiumEnabled = () => store.enabled;

export async function setPremiumEnabled(on: boolean): Promise<void> {
  await dbPut(`${EMOJI_PATH}/enabled`, on);
  store = { ...store, enabled: on };
  charMap = null;
}

function render(entry: EmojiEntry | undefined, fallback: string): string {
  if (!entry) return fallback;
  const char = entry.char || fallback || "•";
  if (!store.enabled || !entry.id || !VALID_EMOJI_ID.test(entry.id)) return char;
  return `<tg-emoji emoji-id="${entry.id}">${char}</tg-emoji>`;
}

/* ---------------- slot emojis ---------------- */

export const slotDefault = (key: string) => EMOJI_SLOTS[key]?.char || "•";

export function slotEntry(key: string): EmojiEntry | undefined {
  return store.slots[key];
}

/** Emoji for message text — premium (custom) emoji when the admin set one. */
export function e(key: string): string {
  return render(store.slots[key], slotDefault(key));
}

/** Plain fallback for inline buttons when no premium button icon is available. */
export function be(key: string): string {
  return store.slots[key]?.char || slotDefault(key);
}

export function listSlotOverrides(): (EmojiEntry & { slot: string })[] {
  return Object.entries(store.slots)
    .map(([slot, v]) => ({ ...v, slot }))
    .sort((a, b) => a.slot.localeCompare(b.slot));
}

export function slotStats(): { total: number; set: number; premium: number } {
  const list = listSlotOverrides();
  return {
    total: Object.keys(EMOJI_SLOTS).length,
    set: list.length,
    premium: list.filter((r) => r.id).length,
  };
}

export async function setSlotEmoji(slot: string, value: EmojiEntry): Promise<EmojiEntry> {
  if (!slot) throw new Error("No emoji slot chosen");
  const entry: EmojiEntry = {
    char: value.char || slotDefault(slot),
    ...(value.id ? { id: value.id } : {}),
    label: EMOJI_SLOTS[slot]?.label || slot,
  };
  await dbPut(`${EMOJI_PATH}/slots/${encKey(slot)}`, entry);
  store.slots = { ...store.slots, [slot]: entry };
  loadedAt = Date.now();
  charMap = null;
  if (value.img)
    await dbPut(`${EMOJI_PATH}/slotimg/${encKey(slot)}`, value.img).catch(() => undefined);
  return entry;
}

export async function saveSlotImage(slot: string, img: string): Promise<void> {
  await dbPut(`${EMOJI_PATH}/slotimg/${encKey(slot)}`, img).catch(() => undefined);
}

export async function clearSlotEmoji(slot: string): Promise<void> {
  await dbPut(`${EMOJI_PATH}/slots/${encKey(slot)}`, null).catch(() => undefined);
  await dbPut(`${EMOJI_PATH}/slotimg/${encKey(slot)}`, null).catch(() => undefined);
  const next = { ...store.slots };
  delete next[slot];
  store.slots = next;
  charMap = null;
}

/* ---------------- product emojis ---------------- */

export function productEmojiEntry(productId: string): EmojiEntry {
  return store.products[productId] || { char: "🛍" };
}

export function productEmoji(productId: string): string {
  return render(store.products[productId], "🛍");
}

export function productEmojiChar(productId: string): string {
  return productEmojiEntry(productId).char || "🛍";
}

export async function setProductEmoji(productId: string, value: EmojiEntry): Promise<void> {
  const { img, ...meta } = value;
  const pathKey = encKey(productId);
  await dbPut(`${EMOJI_PATH}/products/${pathKey}`, meta);
  store.products = { ...store.products, [productId]: meta };
  loadedAt = Date.now();
  if (img) await dbPut(`${EMOJI_PATH}/prodimg/${pathKey}`, img).catch(() => undefined);
}

export async function clearProductEmoji(productId: string): Promise<void> {
  const pathKey = encKey(productId);
  await dbPut(`${EMOJI_PATH}/products/${pathKey}`, null).catch(() => undefined);
  await dbPut(`${EMOJI_PATH}/prodimg/${pathKey}`, null).catch(() => undefined);
  const next = { ...store.products };
  delete next[productId];
  store.products = next;
}

export function productEmojiStats(ids: string[]): { total: number; set: number; premium: number } {
  let set = 0;
  let premium = 0;
  for (const id of ids) {
    const saved = store.products[id];
    if (saved?.char || saved?.id) set++;
    if (saved?.id) premium++;
  }
  return { total: ids.length, set, premium };
}

/** Wipe every emoji setting (slots, artwork, product emojis). */
export async function resetAllEmojis(): Promise<void> {
  await dbPut(EMOJI_PATH, null);
  store = { slots: {}, products: {}, enabled: true };
  loadedAt = Date.now();
}

/* ---------------- outgoing text ---------------- */

/**
 * A chosen premium emoji should also show up in the messages that still use the
 * plain character. Only unambiguous characters are upgraded: if two places use
 * the same character with different premium emojis, the plain one is kept so a
 * wrong emoji can never appear.
 */
let charMap: Map<string, string> | null = null;
let charMapAt = -1;

function premiumCharMap(): Map<string, string> {
  if (charMap && charMapAt === loadedAt) return charMap;
  const map = new Map<string, string>();
  const clash = new Set<string>();
  for (const [slot, entry] of Object.entries(store.slots)) {
    if (!entry?.id || !VALID_EMOJI_ID.test(entry.id)) continue;
    for (const c of [entry.char, slotDefault(slot)]) {
      const key = normEmoji(c);
      if (!key) continue;
      const seen = map.get(key);
      if (seen && seen !== entry.id) {
        clash.add(key);
        continue;
      }
      map.set(key, entry.id);
    }
  }
  for (const key of clash) map.delete(key);
  charMap = map;
  charMapAt = loadedAt;
  return map;
}

const TEXT_EMOJI = /\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

function upgradePiece(piece: string, map: Map<string, string>): string {
  return piece.replace(TEXT_EMOJI, (found) => {
    const id = map.get(normEmoji(found));
    return id ? `<tg-emoji emoji-id="${id}">${found}</tg-emoji>` : found;
  });
}

/** Upgrade plain emojis in message text, never inside tags or existing markup. */
function upgradeText(text: string): string {
  const map = premiumCharMap();
  if (!map.size) return text;
  const tag = /<\/?[a-zA-Z][^>]*>/g;
  let out = "";
  let last = 0;
  let inside = 0;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(text))) {
    const piece = text.slice(last, m.index);
    out += inside ? piece : upgradePiece(piece, map);
    const lower = m[0].toLowerCase();
    if (lower.startsWith("<tg-emoji")) inside++;
    else if (lower.startsWith("</tg-emoji")) inside = Math.max(0, inside - 1);
    out += m[0];
    last = tag.lastIndex;
  }
  const tail = text.slice(last);
  return out + (inside ? tail : upgradePiece(tail, map));
}

/** Premium markup is dropped when the feature is switched off. */
function sanitizeText(text: string): string {
  return store.enabled ? upgradeText(text) : stripPremiumEmojiTags(text);
}

setTextDecorator(sanitizeText);

/* ---------------- coloured inline buttons ---------------- */

const LEAD_EMOJI = /^(\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;
const MARKERS = /^[\u{1F7E2}\u{1F535}\u{1F7E3}\u{1F7E0}\u{1F534}\u{1F7E1}\u26AA\u26AB\u{1F7E4}]\s*/u;
const SUCCESS = /(buy|deposit|approve|complete|confirm|save|generate|add|make admin|joined|yes|enable|set )/i;
const DANGER = /(cancel|reject|remove|delete|refund|turn off|disable|block|withdraw|no,|clear)/i;
const NEUTRAL = /^(menu|back|admin|orders|products|emojis|home)$/i;

let buttonColors: ButtonColorMap = {};

export function setButtonColors(map: ButtonColorMap | null | undefined): void {
  buttonColors = map || {};
}

function styleFromConfig(btn: any): "primary" | "success" | "danger" | undefined | false {
  const key = buttonKeyFor(btn);
  if (!key) return false;
  const chosen = buttonColors[key];
  if (chosen) return styleForColor(chosen);
  const def = BUTTON_CATALOG.find((d) => d.key === key);
  return def ? styleForColor(def.fallback) : false;
}

function styleFor(label: string): "primary" | "success" | "danger" | undefined {
  const plain = label.replace(LEAD_EMOJI, "").trim();
  if (DANGER.test(plain)) return "danger";
  if (SUCCESS.test(plain)) return "success";
  if (NEUTRAL.test(plain)) return undefined;
  return "primary";
}

const BUTTON_SLOT_BY_ACTION: Record<string, string> = {
  products: "btn.products",
  wallet: "btn.wallet",
  profile: "btn.profile",
  reviews: "btn.reviews",
  refer: "btn.refer",
  support: "btn.support",
  orders: "btn.orders",
  apikey: "btn.apikey",
  dep: "btn.deposit",
  wd: "btn.withdraw",
  home: "btn.home",
};

/** Resolve a button to its exact named emoji slot; never guess from a character. */
function buttonEmojiEntry(btn: any): EmojiEntry | undefined {
  const data = String(btn?.callback_data || "");
  const label = String(btn?.text || "");
  let slot = BUTTON_SLOT_BY_ACTION[data];
  if (!slot && data === "psearch") slot = "btn.search";

  // Back / Continue / Cancel navigation buttons never wear a product's emoji.
  if (!slot && /\bprevious\b/i.test(label)) slot = "btn.prev";
  if (!slot && /\bnext\b/i.test(label)) slot = "btn.next";
  if (!slot && /\bsearch\b/i.test(label)) slot = "btn.search";
  if (!slot && /\bback\b|\bmenu\b/i.test(label)) slot = "btn.back";
  if (!slot && /\bcancel\b/i.test(label)) slot = "btn.cancel";
  if (!slot && /\bcontinue\b/i.test(label)) slot = "btn.confirm";

  if (!slot && /^p:/.test(data)) return store.products[data.slice(2)];
  // Quantity callbacks all contain the product id, but only the selected
  // quantity carries its product emoji in the label. Number-only choices
  // must remain undecorated.
  if (!slot && /^bq:/.test(data) && !/^\s*\d+\s*$/.test(stripPremiumEmojiTags(label.replace(MARKERS, "")))) {
    const productId = data.split(":")[1] || "";
    const product = store.products[productId];
    if (product?.id) return product;
  }
  if (!slot && /^(?:b|bpm|bcf|bgo|pbc):/.test(data)) {
    const productId = data.split(":")[1] || "";
    const product = store.products[productId];
    if (product?.id) return product;
    slot = data.startsWith("b:") ? "btn.buy" : data.startsWith("bgo:") ? "btn.confirm" : undefined;
  }
  if (!slot && btn?.url) slot = "btn.website";
  if (!slot && /\bconfirm\b/i.test(label)) slot = "btn.confirm";

  return slot ? store.slots[slot] : undefined;
}

export function decorateKeyboard(markup: any): any {
  if (!markup || !Array.isArray(markup.inline_keyboard)) return markup;
  return {
    ...markup,
    inline_keyboard: markup.inline_keyboard.map((row: any[]) =>
      row.map((btn: any) => {
        if (!btn || typeof btn.text !== "string") return btn;
        const entry = store.enabled ? buttonEmojiEntry(btn) : undefined;
        const premiumId = entry?.id && VALID_EMOJI_ID.test(entry.id) ? entry.id : undefined;
        let text = stripPremiumEmojiTags(btn.text.replace(MARKERS, ""));
        // Telegram renders icon_custom_emoji_id before the label. Strip any
        // leading emoji chars from the text so the icon never doubles them.
        if (premiumId) {
          let lead = text.match(LEAD_EMOJI)?.[0] || "";
          while (lead) {
            text = text.slice(lead.length).trimStart();
            lead = text.match(LEAD_EMOJI)?.[0] || "";
          }
        }
        const out: any = { ...btn, text: text.trim(), ...(premiumId ? { icon_custom_emoji_id: premiumId } : {}) };
        if (!out.style) {
          const configured = styleFromConfig(btn);
          if (configured === false) {
            const s = styleFor(text);
            if (s) out.style = s;
          } else if (configured) {
            out.style = configured;
          }
        }
        return out;
      }),
    ),
  };
}

setKeyboardDecorator(decorateKeyboard);

/* ---------------- capture + artwork ---------------- */

/**
 * Ask Telegram for the canonical unicode fallback of a premium emoji. A stale
 * or inaccessible id returns null, so it is never saved.
 */
export async function verifyCustomEmoji(id: string): Promise<string | null> {
  if (!VALID_EMOJI_ID.test(id)) return null;
  try {
    const res = await tg("getCustomEmojiStickers", { custom_emoji_ids: [id] });
    const emoji = res?.result?.[0]?.emoji;
    return typeof emoji === "string" && emoji.trim() ? emoji : null;
  } catch {
    return null;
  }
}

/** Grab the sticker image once so the website can show the premium emoji. */
export async function fetchEmojiImage(id: string): Promise<string | undefined> {
  try {
    const res = await tg("getCustomEmojiStickers", { custom_emoji_ids: [id] });
    const st = res?.result?.[0];
    if (!st) return undefined;
    // Animated .tgs files cannot be displayed by browsers. Prefer their WebP
    // thumbnail; video and static custom emojis can use the original artwork.
    const candidates = st.is_animated ? [st.thumbnail?.file_id] : [st.file_id, st.thumbnail?.file_id];
    for (const fileId of candidates.filter(Boolean)) {
      const image = await tgFileDataUrl(String(fileId));
      if (image && !image.startsWith("data:application/x-tgsticker")) return image;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Fill in artwork missing for saved premium emojis. Returns how many were fixed. */
export async function syncEmojiImages(): Promise<number> {
  await loadEmojis(true);
  const [slotImgs, prodImgs] = await Promise.all([
    dbGet<Record<string, string>>(`${EMOJI_PATH}/slotimg`),
    dbGet<Record<string, string>>(`${EMOJI_PATH}/prodimg`),
  ]);
  let fixed = 0;
  for (const [slot, r] of Object.entries(store.slots)) {
    if (!r?.id || slotImgs?.[encKey(slot)]) continue;
    const img = await fetchEmojiImage(r.id);
    if (!img) continue;
    await dbPut(`${EMOJI_PATH}/slotimg/${encKey(slot)}`, img);
    fixed++;
  }
  for (const [id, p] of Object.entries(store.products)) {
    if (!p?.id || prodImgs?.[encKey(id)]) continue;
    const img = await fetchEmojiImage(p.id);
    if (!img) continue;
    await dbPut(`${EMOJI_PATH}/prodimg/${encKey(id)}`, img);
    fixed++;
  }
  return fixed;
}

/** Pull the first emoji (with custom emoji id when present) out of a message. */
export function readEmoji(text: string, entities?: any[], sticker?: any): EmojiEntry | null {
  if (sticker?.custom_emoji_id) {
    return { id: String(sticker.custom_emoji_id), char: String(sticker.emoji || "⭐") };
  }
  const custom = (entities || []).find((x) => x?.type === "custom_emoji" && x?.custom_emoji_id);
  if (custom) {
    // Telegram offsets are UTF-16 code units, which JS string slicing matches.
    const char = text.slice(custom.offset, custom.offset + custom.length) || "⭐";
    return { id: String(custom.custom_emoji_id), char };
  }
  const m = text.match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/u);
  return m ? { char: m[0] } : null;
}

/**
 * Verify a captured emoji before it is saved: an id Telegram does not know is
 * kept as its plain character instead of a broken premium emoji.
 */
export async function verifyEntry(value: EmojiEntry): Promise<EmojiEntry> {
  if (!value.id) return value;
  const canonical = await verifyCustomEmoji(value.id);
  if (!canonical) return { char: value.char };
  return { id: value.id, char: canonical };
}
