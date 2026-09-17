/**
 * Server-only emoji registry for the Telegram bot and the website.
 *
 * New, simple logic: the admin replaces one emoji with another. We store a map
 * from the original emoji character to the emoji the admin picked (with its
 * premium id and artwork). Every message, button, caption and website label is
 * then rewritten through that single map, so one change applies everywhere.
 */
import { dbGet, dbPut, setKeyboardDecorator, setTextDecorator, tg, tgFileDataUrl } from "./telegram.server";
import { BOT_EMOJI_SLOTS, WEB_EMOJI_SLOTS } from "./web-emoji";
import {
  BUTTON_CATALOG,
  buttonKeyFor,
  styleForColor,
  type ButtonColorMap,
} from "./button-colors";

export type EmojiEntry = { id?: string; char: string; img?: string };
/**
 * One replacement rule: `from` (original emoji) -> `char`/`id` (new emoji).
 * When `slot` is set the rule only applies to that one named place (for
 * example the Orders button), so emojis shared by several places — 🧾, ⚡,
 * 📦, 💳 — no longer all change together and no longer steal each other's
 * premium emoji id.
 */
export type EmojiRule = { from: string; char: string; id?: string; img?: string; slot?: string };

export const EMOJI_PATH = "telegramEmoji";

/** Firebase keys cannot contain dots, so product ids are encoded. */
export const encKey = (key: string) => key.split(".").join("~");
export const decKey = (key: string) => key.split("~").join(".");
const decodeMap = (map: Record<string, any> | null) =>
  Object.fromEntries(Object.entries(map || {}).map(([k, v]) => [decKey(k), v]));

/** "🛍" and "🛍️" are the same emoji to a person but different text. */
export const normEmoji = (c: string) => String(c || "").replace(/\uFE0F/g, "");

/** Stable, Firebase-safe key for an emoji character. */
export const emojiKey = (char: string) =>
  [...normEmoji(char)].map((c) => c.codePointAt(0)!.toString(16)).join("-");

/** Built-in emoji used by the bot and website, shown as pickable suggestions. */
export const EMOJI_SLOTS: Record<string, { label: string; char: string; group: "button" | "normal" | "web" }> = {
  ...Object.fromEntries(
    Object.entries(WEB_EMOJI_SLOTS).map(([key, v]) => [key, { ...v, group: "web" as const }]),
  ),
  ...BOT_EMOJI_SLOTS,
};

type Store = {
  rules: Record<string, EmojiRule>;
  slots: Record<string, EmojiRule>;
  products: Record<string, EmojiEntry>;
};

let store: Store = { rules: {}, slots: {}, products: {} };
let loadedAt = 0;
let version = 0;
let loading: Promise<void> | null = null;
const EMOJI_CACHE_MS = 60_000;

export async function loadEmojis(force = false): Promise<void> {
  if (!force && loadedAt && Date.now() - loadedAt < EMOJI_CACHE_MS) return;
  if (loading) return loading;
  // Already have emojis but they went stale: refresh in the background, don't wait.
  const background = !force && loadedAt > 0;
  loading = Promise.all([
    dbGet<Record<string, EmojiRule>>(`${EMOJI_PATH}/map`),
    dbGet<Record<string, EmojiEntry>>(`${EMOJI_PATH}/products`),
    dbGet<Record<string, EmojiRule>>(`${EMOJI_PATH}/slots`),
  ])
    .then(([rules, products, slots]) => {
      store = { rules: rules || {}, slots: decodeMap(slots), products: decodeMap(products) };
      loadedAt = Date.now();
      version++;
    })
    .catch(() => undefined)
    .finally(() => {
      loading = null;
    });
  if (background) return;
  return loading;
}

function render(e: { char: string; id?: string }): string {
  const char = e.char || "•";
  return e.id ? `<tg-emoji emoji-id="${e.id}">${char}</tg-emoji>` : char;
}

function ruleFor(char: string): EmojiRule | undefined {
  return store.rules[emojiKey(char)];
}

/** A rule saved for this exact place wins over a general "replace this emoji" rule. */
function ruleForSlot(key: string): EmojiRule | undefined {
  return store.slots[key] || ruleFor(EMOJI_SLOTS[key]?.char || "");
}

/** Emoji for message text — premium (custom) emoji when the admin set one. */
export function e(key: string): string {
  const def = EMOJI_SLOTS[key]?.char || "•";
  const r = ruleForSlot(key);
  return r ? render(r) : def;
}

/** Emoji for inline buttons — Telegram buttons only support plain characters. */
export function be(key: string): string {
  const def = EMOJI_SLOTS[key]?.char || "•";
  return ruleForSlot(key)?.char || def;
}

/* ---------------- product emojis ---------------- */

export function productEmojiEntry(productId: string): EmojiEntry {
  return store.products[productId] || { char: "🛍" };
}

export function productEmoji(productId: string): string {
  return render(productEmojiEntry(productId));
}

export function productEmojiChar(productId: string): string {
  return productEmojiEntry(productId).char || "🛍";
}

export async function setProductEmoji(productId: string, value: EmojiEntry): Promise<void> {
  const { img, ...meta } = value;
  const pathKey = encKey(productId);
  await dbPut(`${EMOJI_PATH}/products/${pathKey}`, meta);
  store.products = { ...store.products, [productId]: meta };
  version++;
  if (img) await dbPut(`${EMOJI_PATH}/prodimg/${pathKey}`, img).catch(() => undefined);
}

export async function clearProductEmoji(productId: string): Promise<void> {
  const pathKey = encKey(productId);
  await dbPut(`${EMOJI_PATH}/products/${pathKey}`, null).catch(() => undefined);
  await dbPut(`${EMOJI_PATH}/prodimg/${pathKey}`, null).catch(() => undefined);
  const next = { ...store.products };
  delete next[productId];
  store.products = next;
  version++;
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

/* ---------------- replacement rules ---------------- */

export function listRules(): EmojiRule[] {
  const slotted = Object.entries(store.slots).map(([slot, r]) => ({ ...r, slot }));
  return [...Object.values(store.rules), ...slotted].sort((a, b) =>
    (a.slot || a.from).localeCompare(b.slot || b.from),
  );
}

export function ruleStats(): { total: number; premium: number } {
  const list = listRules();
  return { total: list.length, premium: list.filter((r) => r.id).length };
}

/** Key used in saved-list buttons; slot rules get an "s:" prefix. */
export function ruleKey(r: EmojiRule): string {
  return r.slot ? `s:${encKey(r.slot)}` : emojiKey(r.from);
}

/**
 * Save the admin's choice and apply it immediately. With `slot` the change is
 * limited to that one place; without it every copy of `from` changes.
 */
export async function setRule(from: string, value: EmojiEntry, slot?: string): Promise<EmojiRule> {
  const key = slot ? encKey(slot) : emojiKey(from);
  if (!key) throw new Error("No emoji to replace");
  const rule: EmojiRule = {
    from: normEmoji(from),
    char: value.char,
    ...(value.id ? { id: value.id } : {}),
    ...(slot ? { slot } : {}),
  };
  await dbPut(`${EMOJI_PATH}/${slot ? "slots" : "map"}/${key}`, rule);
  // A successful database PUT is authoritative. A second immediate read can
  // fail transiently and previously reported a false save failure to admins.
  if (slot) store.slots = { ...store.slots, [slot]: rule };
  else store.rules = { ...store.rules, [key]: rule };
  version++;
  if (value.img)
    await dbPut(`${EMOJI_PATH}/${slot ? "slotimg" : "mapimg"}/${key}`, value.img).catch(() => undefined);
  return rule;
}

export async function saveRuleImage(from: string, img: string, slot?: string): Promise<void> {
  const key = slot ? encKey(slot) : emojiKey(from);
  await dbPut(`${EMOJI_PATH}/${slot ? "slotimg" : "mapimg"}/${key}`, img).catch(() => undefined);
}

export async function removeRule(key: string): Promise<void> {
  if (key.startsWith("s:")) {
    const enc = key.slice(2);
    const slot = decKey(enc);
    await dbPut(`${EMOJI_PATH}/slots/${enc}`, null).catch(() => undefined);
    await dbPut(`${EMOJI_PATH}/slotimg/${enc}`, null).catch(() => undefined);
    const next = { ...store.slots };
    delete next[slot];
    store.slots = next;
    version++;
    return;
  }
  await dbPut(`${EMOJI_PATH}/map/${key}`, null).catch(() => undefined);
  await dbPut(`${EMOJI_PATH}/mapimg/${key}`, null).catch(() => undefined);
  const next = { ...store.rules };
  delete next[key];
  store.rules = next;
  version++;
}

/** Wipe every emoji setting (rules, artwork, product emojis, old records). */
export async function resetAllEmojis(): Promise<void> {
  await dbPut(EMOJI_PATH, null);
  store = { rules: {}, slots: {}, products: {} };
  loadedAt = Date.now();
  version++;
}

/* ---------------- global rewriting ---------------- */

const EMOJI_RE = /\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/gu;
const LEAD_EMOJI = /^(\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*)\s*/u;
const MARKERS = /^[\u{1F7E2}\u{1F535}\u{1F7E3}\u{1F7E0}\u{1F534}\u{1F7E1}\u26AA\u26AB\u{1F7E4}]\s*/u;

const SUCCESS = /(buy|deposit|approve|complete|confirm|save|generate|add|make admin|joined|yes|enable|set )/i;
const DANGER = /(cancel|reject|remove|delete|refund|turn off|disable|block|withdraw|no,|clear)/i;
const NEUTRAL = /^(menu|back|admin|orders|products|emojis|home)$/i;

let charCache: { at: number; plain: Map<string, string>; html: Map<string, string>; ids: Map<string, string> } | null = null;

function charMaps() {
  if (charCache && charCache.at === version) return charCache;
  const plain = new Map<string, string>();
  const html = new Map<string, string>();
  const ids = new Map<string, string>();
  // Several premium emojis can share the same plain character. Guessing an id
  // from the character alone then showed the wrong premium emoji, so a
  // character claimed by two different ids is left plain instead.
  const clash = new Set<string>();
  const claim = (char: string, id?: string) => {
    if (!id || !char) return;
    const k = normEmoji(char);
    const seen = ids.get(k);
    if (seen && seen !== id) {
      clash.add(k);
      return;
    }
    ids.set(k, id);
  };
  for (const r of Object.values(store.rules)) {
    const from = normEmoji(r.from);
    if (!from || !r.char) continue;
    plain.set(from, r.char);
    html.set(from, render(r));
    claim(r.char, r.id);
  }
  for (const r of Object.values(store.slots)) claim(r.char, r.id);
  for (const p of Object.values(store.products)) claim(p?.char || "", p?.id);
  for (const k of clash) ids.delete(k);
  charCache = { at: version, plain, html, ids };
  return charCache;
}

/** Upgrade every emoji in an outgoing message to the admin's choice. */
export function upgradeText(text: string): string {
  const { html } = charMaps();
  if (!html.size) return text;
  return text
    .split(/(<tg-emoji[^>]*>[\s\S]*?<\/tg-emoji>)/g)
    .map((part) =>
      part.startsWith("<tg-emoji") ? part : part.replace(EMOJI_RE, (m) => html.get(normEmoji(m)) || m),
    )
    .join("");
}

function upgradeButtonText(text: string): string {
  const { plain } = charMaps();
  if (!plain.size) return text;
  return text.replace(EMOJI_RE, (m) => plain.get(normEmoji(m)) || m);
}

/* ---------------- coloured inline buttons ---------------- */

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

export function decorateKeyboard(markup: any): any {
  if (!markup || !Array.isArray(markup.inline_keyboard)) return markup;
  const { ids } = charMaps();
  return {
    ...markup,
    inline_keyboard: markup.inline_keyboard.map((row: any[]) =>
      row.map((btn: any) => {
        if (!btn || typeof btn.text !== "string") return btn;
        const text = upgradeButtonText(btn.text.replace(MARKERS, ""));
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
          const id = lead ? ids.get(normEmoji(lead)) : undefined;
          if (id) {
            // Telegram shows icon_custom_emoji_id beside the label, so the
            // Unicode copy is removed to avoid the same emoji twice.
            out.icon_custom_emoji_id = id;
            out.text = text.replace(LEAD_EMOJI, "").trimStart();
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

/** Grab the sticker image once so the website can show the premium emoji. */
export async function fetchEmojiImage(id: string): Promise<string | undefined> {
  try {
    const res = await tg("getCustomEmojiStickers", { custom_emoji_ids: [id] });
    const st = res?.result?.[0];
    if (!st) return undefined;
    // Animated .tgs files cannot be displayed by browsers. Prefer their WebP
    // thumbnail; video and static custom emojis can use the original artwork.
    const candidates = st.is_animated
      ? [st.thumbnail?.file_id]
      : [st.file_id, st.thumbnail?.file_id];
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
  const [imgs, prodImgs, slotImgs] = await Promise.all([
    dbGet<Record<string, string>>(`${EMOJI_PATH}/mapimg`),
    dbGet<Record<string, string>>(`${EMOJI_PATH}/prodimg`),
    dbGet<Record<string, string>>(`${EMOJI_PATH}/slotimg`),
  ]);
  let fixed = 0;
  for (const [key, r] of Object.entries(store.rules)) {
    if (!r?.id || imgs?.[key]) continue;
    const img = await fetchEmojiImage(r.id);
    if (!img) continue;
    await dbPut(`${EMOJI_PATH}/mapimg/${key}`, img);
    fixed++;
  }
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

/** Emoji suggestions the admin can tap instead of typing one. */
export function suggestedEmojis(): { char: string; label: string }[] {
  const seen = new Set<string>();
  const out: { char: string; label: string }[] = [];
  for (const def of Object.values(EMOJI_SLOTS)) {
    const k = normEmoji(def.char);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push({ char: def.char, label: def.label });
  }
  return out;
}

/** Pull the first emoji (with custom emoji id when present) out of a message. */
export function readEmoji(text: string, entities?: any[], sticker?: any): EmojiEntry | null {
  if (sticker?.custom_emoji_id) {
    return { id: String(sticker.custom_emoji_id), char: String(sticker.emoji || "⭐") };
  }
  const custom = (entities || []).find((x) => x?.type === "custom_emoji" && x?.custom_emoji_id);
  if (custom) {
    const char = text.slice(custom.offset, custom.offset + custom.length) || "⭐";
    return { id: String(custom.custom_emoji_id), char };
  }
  const m = text.match(/\p{Extended_Pictographic}(\uFE0F|\u200D\p{Extended_Pictographic})*/u);
  return m ? { char: m[0] } : null;
}
