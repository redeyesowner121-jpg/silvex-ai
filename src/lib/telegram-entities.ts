/**
 * Convert the HTML we build for bot messages into Telegram's
 * `{ text, entities }` form.
 *
 * Telegram's HTML parse mode does not render `<tg-emoji>` reliably on every
 * client, so any message that contains a premium (custom) emoji is sent as
 * plain text plus explicit entities instead. Offsets are UTF-16 code units,
 * which is exactly what JavaScript string indexes already are.
 */

/** Telegram custom emoji ids are int64 numbers sent as a string. */
export const VALID_EMOJI_ID = /^[1-9]\d{14,19}$/;

export type TgEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
  custom_emoji_id?: string;
};

/** Remove premium emoji markup, leaving the plain unicode fallback. */
export function stripPremiumEmojiTags(html: string): string {
  return String(html || "")
    .replace(/<tg-emoji[^>]*>([\s\S]*?)<\/tg-emoji>/g, "$1")
    // Orphan opening tags would otherwise break the whole message.
    .replace(/<tg-emoji[^>]*>/g, "");
}

export function hasPremiumEmoji(html: unknown): boolean {
  return typeof html === "string" && html.includes("<tg-emoji");
}

const SIMPLE: Record<string, string> = {
  b: "bold",
  strong: "bold",
  i: "italic",
  em: "italic",
  u: "underline",
  ins: "underline",
  s: "strikethrough",
  strike: "strikethrough",
  del: "strikethrough",
  code: "code",
  pre: "pre",
  blockquote: "blockquote",
  "tg-spoiler": "spoiler",
};

function unescapeHtml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Returns null when the markup contains something this converter does not
 * understand — the caller then falls back to Telegram's HTML parse mode.
 */
export function htmlToEntities(html: string): { text: string; entities: TgEntity[] } | null {
  const input = String(html || "");
  const tag = /<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s[^>]*)?)>/g;
  const stack: { type: string; offset: number; extra: Partial<TgEntity> }[] = [];
  const entities: TgEntity[] = [];
  let text = "";
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = tag.exec(input))) {
    text += unescapeHtml(input.slice(last, m.index));
    last = tag.lastIndex;
    const name = (m[1] || "").toLowerCase();
    const closing = m[0].startsWith("</");
    const attrs = m[2] || "";

    if (name === "br") {
      text += "\n";
      continue;
    }

    if (closing) {
      const open = stack.pop();
      if (!open || open.type !== typeFor(name)) return null;
      const length = text.length - open.offset;
      if (length > 0) entities.push({ type: open.type, offset: open.offset, length, ...open.extra });
      continue;
    }

    if (name === "tg-emoji") {
      const id = /emoji-id\s*=\s*"([^"]+)"/.exec(attrs)?.[1] || "";
      // An invalid or stale id must never reach Telegram — the fallback emoji
      // is simply shown as plain text instead of failing the whole message.
      stack.push({
        type: "custom_emoji",
        offset: text.length,
        extra: VALID_EMOJI_ID.test(id) ? { custom_emoji_id: id } : {},
      });
      continue;
    }

    if (name === "a") {
      const url = /href\s*=\s*"([^"]+)"/.exec(attrs)?.[1] || "";
      if (!url) return null;
      stack.push({ type: "text_link", offset: text.length, extra: { url: unescapeHtml(url) } });
      continue;
    }

    const type = SIMPLE[name];
    if (!type) return null;
    stack.push({ type, offset: text.length, extra: {} });
  }

  if (stack.length) return null;
  text += unescapeHtml(input.slice(last));
  return {
    text,
    entities: entities
      .filter((e) => e.type !== "custom_emoji" || e.custom_emoji_id)
      .sort((a, b) => a.offset - b.offset),
  };
}

function typeFor(name: string): string {
  if (name === "tg-emoji") return "custom_emoji";
  if (name === "a") return "text_link";
  return SIMPLE[name] || name;
}
