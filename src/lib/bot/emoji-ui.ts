/** The /setemoji screens: pick a slot, send the new emoji, list and reset. */
import {
  be,
  clearProductEmoji,
  fetchEmojiImage,
  listRules,
  productEmojiChar,
  productEmojiStats,
  readEmoji,
  removeRule,
  ruleKey,
  ruleStats,
  saveRuleImage,
  setProductEmoji,
  setRule,
  EMOJI_SLOTS,
} from "@/lib/emoji.server";
import { allProducts, say, setState } from "./core";

const EM_PAGE = 12;

function emPager(prefix: string, page: number, total: number) {
  const pages = Math.max(1, Math.ceil(total / EM_PAGE));
  if (pages < 2) return [] as any[];
  const row: any[] = [];
  if (page > 0) row.push({ text: "⬅️ Prev", callback_data: `${prefix}${page - 1}` });
  row.push({ text: `${page + 1}/${pages}`, callback_data: "noop" });
  if (page < pages - 1) row.push({ text: "Next ➡️", callback_data: `${prefix}${page + 1}` });
  return [row];
}

export async function emojiHome(chatId: number, note = "") {
  const all = await allProducts();
  const p = productEmojiStats(Object.keys(all));
  const r = ruleStats();
  await say(
    chatId,
    `😍 <b>Emoji setup</b>\n\nHow it works: send the emoji you want to change, then send the new one. It is applied everywhere in the bot and on the website at once.\n\n🔁 Replaced emojis: ${r.total} (✨${r.premium} premium)\n🛍 Product emojis: ${p.set}/${p.total} (✨${p.premium})${note ? `\n\n${note}` : ""}`,
    {
      inline_keyboard: [
        [{ text: "➕ Change an emoji", callback_data: "a:em:add" }],
        [
          { text: "🔘 Button emojis", callback_data: "a:emg:button:0" },
          { text: "🔤 Normal emojis", callback_data: "a:emg:normal:0" },
        ],
        [{ text: "🌐 Website emojis", callback_data: "a:emg:web:0" }],
        [
          { text: "📋 Saved emojis", callback_data: "a:em:list" },
          { text: "🛍 Product emojis", callback_data: "a:em:prod" },
        ],
        [{ text: "🔄 Sync website artwork", callback_data: "a:em:sync" }],
        [{ text: "♻️ Reset all emojis", callback_data: "a:em:rst" }],
        [{ text: "⬅️ Admin", callback_data: "a:home" }],
      ],
    },
  );
}

export async function emojiAsk(chatId: number) {
  await setState(chatId, { k: "em_from" });
  await say(
    chatId,
    "1️⃣ Send the emoji you want to change (the one you see now in the bot or on the website).",
    { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "a:em" }]] },
  );
}

const GROUP_TITLE: Record<string, string> = {
  button: "🔘 <b>Button emojis</b>",
  normal: "🔤 <b>Normal emojis</b>",
  web: "🌐 <b>Website emojis</b>",
};

/** Ready-made list of every emoji the bot/website uses, grouped by where it is shown. */
export async function emojiGroup(chatId: number, group: string, page = 0) {
  const slots = Object.entries(EMOJI_SLOTS).filter(([, v]) => v.group === group);
  if (!slots.length)
    return say(chatId, "Nothing here yet.", {
      inline_keyboard: [[{ text: "⬅️ Emojis", callback_data: "a:em" }]],
    });
  const slice = slots.slice(page * EM_PAGE, page * EM_PAGE + EM_PAGE);
  await say(
    chatId,
    `${GROUP_TITLE[group] || "Emojis"}\nTap one, then send the emoji you want to use instead.`,
    {
      inline_keyboard: [
        ...slice.map(([key, v]) => [{ text: `${be(key)} ${v.label}`, callback_data: `a:emk:${key}` }]),
        ...emPager(`a:emg:${group}:`, page, slots.length),
        [{ text: "⬅️ Emojis", callback_data: "a:em" }],
      ],
    },
  );
}

/** Admin picked a ready-made slot — jump straight to "send the new emoji". */
export async function emojiSlotPick(chatId: number, slotKey: string) {
  const slot = EMOJI_SLOTS[slotKey];
  if (!slot) return emojiHome(chatId);
  await setState(chatId, { k: "em_to", a: slot.char, b: slotKey });
  return say(
    chatId,
    `Send the new emoji for <b>${slot.label}</b> (now ${be(slotKey)}).\nPremium (custom) emojis work too.`,
    { inline_keyboard: [[{ text: "❌ Cancel", callback_data: `a:emg:${slot.group}:0` }]] },
  );
}

export async function emojiList(chatId: number, page = 0) {
  const rules = listRules();
  if (!rules.length)
    return say(chatId, "No emoji changed yet.", {
      inline_keyboard: [
        [{ text: "➕ Change an emoji", callback_data: "a:em:add" }],
        [{ text: "⬅️ Emojis", callback_data: "a:em" }],
      ],
    });
  const slice = rules.slice(page * EM_PAGE, page * EM_PAGE + EM_PAGE);
  await say(chatId, "📋 <b>Saved emojis</b>\nTap one to remove it.", {
    inline_keyboard: [
      ...slice.map((r) => [
        {
          text: `${r.slot ? EMOJI_SLOTS[r.slot]?.label || r.slot : r.from} ➜ ${r.char}${r.id ? " ✨" : ""}`,
          callback_data: `a:emd:${ruleKey(r)}`,
        },
      ]),
      ...emPager("a:emL:", page, rules.length),
      [{ text: "⬅️ Emojis", callback_data: "a:em" }],
    ],
  });
}

export async function emojiProducts(chatId: number, page = 0) {
  const all = await allProducts();
  const entries = Object.entries(all);
  if (!entries.length)
    return say(chatId, "No products yet.", {
      inline_keyboard: [[{ text: "⬅️ Emojis", callback_data: "a:em" }]],
    });
  const slice = entries.slice(page * EM_PAGE, page * EM_PAGE + EM_PAGE);
  await say(chatId, "🛍 <b>Product emojis</b>\nChoose a product, then send the emoji.", {
    inline_keyboard: [
      ...slice.map(([id, p]) => [
        { text: `${productEmojiChar(id)} ${p.title || "Item"}`, callback_data: `a:emp:${id}` },
      ]),
      ...emPager("a:emP:", page, entries.length),
      [{ text: "⬅️ Emojis", callback_data: "a:em" }],
    ],
  });
}

/** Step 1: remember which emoji is being replaced. */
export async function emojiFromMessage(chatId: number, text: string, entities?: any[], sticker?: any) {
  const value = readEmoji(text, entities, sticker);
  if (!value) return say(chatId, "Please send one emoji.");
  await setState(chatId, { k: "em_to", a: value.char });
  return say(
    chatId,
    `2️⃣ Now send the new emoji to use instead of ${value.char}.\nPremium (custom) emojis work too — send it normally or forward the emoji.`,
    { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "a:em" }]] },
  );
}

/** Step 2: save the replacement and apply it right away. */
export async function emojiToMessage(
  chatId: number,
  from: string,
  text: string,
  entities?: any[],
  sticker?: any,
  slot?: string,
) {
  const value = readEmoji(text, entities, sticker);
  if (!value) return say(chatId, "Please send one emoji.");
  try {
    await setRule(from, value, slot);
  } catch (error) {
    console.error("emoji save failed", error);
    return say(chatId, "❌ That emoji could not be saved. Please try again.");
  }
  await setState(chatId, null);
  let note = "";
  if (value.id) {
    const img = await fetchEmojiImage(value.id);
    if (img) await saveRuleImage(from, img, slot);
    else note = "\n⚠️ The website could not download this premium emoji's picture.";
  }
  const where = slot ? EMOJI_SLOTS[slot]?.label || slot : from;
  await say(chatId, `✅ Saved: ${where} ➜ ${value.char}${value.id ? " (premium ✨)" : ""}${note}`);
  return emojiHome(chatId);
}

/** Product emoji step. */
export async function emojiProductMessage(
  chatId: number,
  productId: string,
  text: string,
  entities?: any[],
  sticker?: any,
) {
  const value = readEmoji(text, entities, sticker);
  if (!value) return say(chatId, "Please send one emoji.");
  try {
    await setProductEmoji(productId, value);
  } catch (error) {
    console.error("product emoji save failed", error);
    return say(chatId, "❌ That emoji could not be saved. Please try again.");
  }
  if (value.id) {
    const img = await fetchEmojiImage(value.id);
    if (img) await setProductEmoji(productId, { ...value, img });
  }
  await setState(chatId, null);
  await say(chatId, `✅ Product emoji saved: ${value.char}${value.id ? " (premium ✨)" : ""}`);
  return emojiProducts(chatId);
}

export { clearProductEmoji, removeRule };
