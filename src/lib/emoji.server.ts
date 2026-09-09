/** Server-only emoji registry for the Telegram bot and the website. */
import { dbGet, dbPatch, dbPut, setKeyboardDecorator, tg, tgFileDataUrl } from "./telegram.server";
import { WEB_EMOJI_SLOTS } from "./web-emoji";
import {
  BUTTON_CATALOG,
  buttonKeyFor,
  styleForColor,
  type ButtonColorMap,
} from "./button-colors";

export type EmojiEntry = { id?: string; char: string; img?: string };
export type EmojiStore = {
  keys?: Record<string, EmojiEntry>;
  products?: Record<string, EmojiEntry>;
};

export const EMOJI_PATH = "telegramEmoji";

/**
 * Slot names contain dots ("web.home"), which Firebase does not allow inside a
 * key, so they are stored with "~" instead. This was silently dropping every
 * saved emoji before.
 */
export const encKey = (key: string) => key.split(".").join("~");
export const decKey = (key: string) => key.split("~").join(".");
const decodeMap = (map: Record<string, any> | null) =>
  Object.fromEntries(Object.entries(map || {}).map(([k, v]) => [decKey(k), v]));

/** Built-in slots the admin can override with premium (custom) emojis. */
export type EmojiGroup = "button" | "normal" | "web";

export const EMOJI_SLOTS: Record<string, { label: string; char: string; group: EmojiGroup }> = {
  ...Object.fromEntries(
    Object.entries(WEB_EMOJI_SLOTS).map(([key, v]) => [key, { ...v, group: "web" as const }]),
  ),
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
let loadedAt = 0;
let loading: Promise<void> | null = null;
const EMOJI_CACHE_MS = 60_000;

export async function loadEmojis(): Promise<void> {
  if (loadedAt && Date.now() - loadedAt < EMOJI_CACHE_MS) return;
  if (loading) return loading;
  // Only the small key/product maps are loaded — the premium artwork lives in a
  // separate branch so the bot never downloads megabytes of images per update.
  loading = Promise.all([
    dbGet<Record<string, EmojiEntry>>(`${EMOJI_PATH}/keys`),
    dbGet<Record<string, EmojiEntry>>(`${EMOJI_PATH}/products`),
  ])
    .then(([keys, products]) => {
      store = { keys: decodeMap(keys), products: products || {} };
      loadedAt = Date.now();
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

function entry(key: string): EmojiEntry {
  const saved = store.keys?.[key];
  if (saved?.char || saved?.id)
    return { char: saved.char || EMOJI_SLOTS[key]?.char || "•", id: saved.id ?? "", img: saved.img ?? "" };
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
  const { img, ...meta } = value;
  const pathKey = encKey(key);
  // Save the small id/character record first. Artwork can be large and must
  // never prevent the Telegram emoji itself from becoming active.
  await dbPut(`${EMOJI_PATH}/keys/${pathKey}`, meta);
  const persisted = await dbGet<EmojiEntry>(`${EMOJI_PATH}/keys/${pathKey}`);
  if (!persisted || persisted.char !== meta.char || (meta.id && persisted.id !== meta.id)) {
    throw new Error(`Emoji slot ${key} was not persisted`);
  }
  store.keys = { ...(store.keys || {}), [key]: persisted };
  loadedAt = Date.now();
  if (img) await dbPut(`${EMOJI_PATH}/img/${pathKey}`, img).catch(() => undefined);
}

export async function setProductEmoji(productId: string, value: EmojiEntry): Promise<void> {
  const { img, ...meta } = value;
  await dbPut(`${EMOJI_PATH}/products/${productId}`, meta);
  store.products = { ...(store.products || {}), [productId]: meta };
  loadedAt = Date.now();
  if (img) await dbPut(`${EMOJI_PATH}/prodimg/${productId}`, img).catch(() => undefined);
}

export function slotList(group: EmojiGroup): { key: string; label: string; preview: string }[] {
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
  await dbPatch(
    `${EMOJI_PATH}/keys`,
    Object.fromEntries(Object.entries(patch).map(([k, v]) => [encKey(k), v])),
  );
}

/* ---------------- coloured inline buttons (Bot API 10.3) ---------------- */

const MARKERS = /^[\u{1F7E2}\u{1F535}\u{1F7E3}\u{1F7E0}\u{1F534}\u{1F7E1}\u26AA\u26AB\u{1F7E4}]\s*/u;
const LEAD_EMOJI = /^(\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;

const SUCCESS = /(buy|deposit|approve|complete|confirm|save|generate|add|make admin|joined|yes|enable|set )/i;
const DANGER = /(cancel|reject|remove|delete|refund|turn off|disable|block|withdraw|no,|clear)/i;
const NEUTRAL = /^(menu|back|admin|orders|products|emojis|home)$/i;

/** Map a saved emoji character back to its premium (custom emoji) id, if any. */
function customIdForChar(char: string): string | undefined {
  for (const v of Object.values(store.keys || {})) if (v?.char === char && v.id) return v.id;
  for (const v of Object.values(store.products || {})) if (v?.char === char && v.id) return v.id;
  return undefined;
}

/** Colours the admin picked on the website, loaded per bot update. */
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

/* ---------------- global emoji mapping ---------------- */

const EMOJI_RE = /\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu;

let charCache: { at: number; plain: Map<string, string>; html: Map<string, string> } | null = null;

/**
 * Every place the same emoji appears must follow what the admin picked, not
 * only the one slot it was set on. Maps the built-in character of each slot to
 * whatever the admin chose (and to its premium markup when there is one).
 */
function charMaps() {
  if (charCache && charCache.at === loadedAt) return charCache;
  const plain = new Map<string, string>();
  const html = new Map<string, string>();
  const put = (from: string, e: EmojiEntry) => {
    if (!from || !e?.char) return;
    plain.set(from, e.char);
    html.set(from, render(e));
  };
  for (const [key, def] of Object.entries(EMOJI_SLOTS)) {
    const saved = store.keys?.[key];
    if (saved?.char || saved?.id) put(def.char, { char: saved.char || def.char, id: saved.id ?? "" });
  }
  for (const v of Object.values(store.keys || {})) if (v?.id && v.char) put(v.char, v);
  for (const v of Object.values(store.products || {})) if (v?.id && v.char) put(v.char, v);
  charCache = { at: loadedAt, plain, html };
  return charCache;
}

/** Upgrade every emoji in an outgoing message to the admin's choice. */
export function upgradeText(text: string): string {
  const { html } = charMaps();
  if (!html.size) return text;
  return text
    .split(/(<tg-emoji[^>]*>[\s\S]*?<\/tg-emoji>)/g)
    .map((part) =>
      part.startsWith("<tg-emoji") ? part : part.replace(EMOJI_RE, (m) => html.get(m) || m),
    )
    .join("");
}

/** Buttons only support plain characters, so swap the character itself. */
function upgradeButtonText(text: string): string {
  const { plain } = charMaps();
  if (!plain.size) return text;
  return text.replace(EMOJI_RE, (m) => plain.get(m) || m);
}

export function decorateKeyboard(markup: any): any {
  if (!markup || !Array.isArray(markup.inline_keyboard)) return markup;
  return {
    ...markup,
    inline_keyboard: markup.inline_keyboard.map((row: any[]) =>
      row.map((btn: any) => {
        if (!btn || typeof btn.text !== "string") return btn;
        // The old fake "colour dots" are no longer needed — Telegram colours the button itself.
        let text = upgradeButtonText(btn.text.replace(MARKERS, ""));
        const out: any = { ...btn, text };
        if (!out.style) {
          const configured = styleFromConfig(btn);
          if (configured === false) {
            const s = styleFor(text);
            if (s) out.style = s;
          } else if (configured) {
            out.style = configured;
          }
        }
        if (!out.icon_custom_emoji_id) {
          const lead = LEAD_EMOJI.exec(text)?.[1];
          const id = lead ? customIdForChar(lead) : undefined;
          if (id) {
            out.icon_custom_emoji_id = id;
            out.text = text.replace(LEAD_EMOJI, "").trim() || text;
          }
        }
        return out;
      }),
    ),
  };
}

setKeyboardDecorator(decorateKeyboard);
setTextDecorator(upgradeText);


/* ---------------- premium emoji artwork (for the website) ---------------- */

/**
 * The website can't render Telegram custom emojis, so grab the sticker image
 * once when the admin sets it and store it as a data URL next to the emoji.
 */
export async function fetchEmojiImage(id: string): Promise<string | undefined> {
  try {
    const res = await tg("getCustomEmojiStickers", { custom_emoji_ids: [id] });
    const st = res?.result?.[0];
    if (!st) return undefined;
    // Animated (.tgs) emojis have no still frame we can use except the thumbnail.
    const fileId = st.is_animated ? st.thumbnail?.file_id : st.file_id || st.thumbnail?.file_id;
    if (!fileId) return undefined;
    return (await tgFileDataUrl(String(fileId))) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Fill in missing artwork for premium emojis that were saved before images
 * were captured, so the website can show them too. Returns how many were fixed.
 */
export async function syncEmojiImages(): Promise<number> {
  await loadEmojis();
  const [slotImgs, prodImgs] = await Promise.all([
    dbGet<Record<string, string>>(`${EMOJI_PATH}/img`),
    dbGet<Record<string, string>>(`${EMOJI_PATH}/prodimg`),
  ]);
  let fixed = 0;

  for (const [key, v] of Object.entries(store.keys || {})) {
    if (!v?.id) continue;
    if (v.img) {
      // Legacy record: artwork used to sit inside the key itself.
      await dbPut(`${EMOJI_PATH}/img/${encKey(key)}`, v.img);
      const meta = { char: v.char, id: v.id };
      store.keys = { ...(store.keys || {}), [key]: meta };
      await dbPut(`${EMOJI_PATH}/keys/${encKey(key)}`, meta);
      fixed++;
      continue;
    }
    if (slotImgs?.[encKey(key)]) continue;
    const img = await fetchEmojiImage(v.id);
    if (!img) continue;
    await dbPut(`${EMOJI_PATH}/img/${encKey(key)}`, img);
    fixed++;
  }

  for (const [id, v] of Object.entries(store.products || {})) {
    if (!v?.id) continue;
    if (v.img) {
      await dbPut(`${EMOJI_PATH}/prodimg/${id}`, v.img);
      const meta = { char: v.char, id: v.id };
      store.products = { ...(store.products || {}), [id]: meta };
      await dbPut(`${EMOJI_PATH}/products/${id}`, meta);
      fixed++;
      continue;
    }
    if (prodImgs?.[id]) continue;
    const img = await fetchEmojiImage(v.id);
    if (!img) continue;
    await dbPut(`${EMOJI_PATH}/prodimg/${id}`, img);
    fixed++;
  }

  return fixed;
}
