/** Server-only store announcements pushed to every Telegram bot user. */
import {
  dbGet,
  dbPatch,
  loadBotRuntime,
  money,
  siteUrl,
  tg,
  tgSendPhoto,
} from "./telegram.server";

export type BroadcastKind = "new" | "restock" | "low" | "flash";

type Product = {
  title?: string;
  price?: number;
  logo?: string;
  hidden?: boolean;
  stock?: string[];
  supplierStock?: number;
  delivery?: string;
};

/** Admin can switch announcements off from the panel (site_settings/config). */
async function enabled(): Promise<boolean> {
  const cfg = await dbGet<Record<string, unknown>>("site_settings/config").catch(() => null);
  return (cfg as { broadcasts?: boolean } | null)?.broadcasts !== false;
}

function stockOf(p: Product): number {
  if (p.delivery === "supplier") return Number(p.supplierStock ?? 0);
  return (p.stock || []).filter(Boolean).length;
}

function body(kind: BroadcastKind, p: Product, extra: { price?: number; left?: number; ends?: number }) {
  const title = p.title || "New item";
  const price = money(Number(extra.price ?? p.price ?? 0));
  switch (kind) {
    case "new":
      return `🆕 <b>New product available</b>\n\n<b>${title}</b>\nPrice: ${price}\n\nTap below to grab it.`;
    case "restock":
      return `📦 <b>Back in stock</b>\n\n<b>${title}</b>\nPrice: ${price}\nAvailable: ${extra.left ?? stockOf(p)}\n\nGet it before it runs out.`;
    case "low":
      return `⚠️ <b>Almost sold out</b>\n\n<b>${title}</b>\nPrice: ${price}\nOnly ${extra.left ?? stockOf(p)} left!\n\nHurry up.`;
    case "flash":
      return `⚡ <b>FLASH SALE</b>\n\n<b>${title}</b>\nNow ${price}${p.price ? ` (was ${money(Number(p.price))})` : ""}${
        extra.ends ? `\nEnds: ${new Date(extra.ends).toLocaleString()}` : ""
      }\n\nLimited time only.`;
  }
}

/** Send a store announcement with buttons to every bot user. */
export async function announce(
  kind: BroadcastKind,
  productId: string,
  extra: { price?: number; left?: number; ends?: number } = {},
): Promise<{ ok: boolean; sent: number; total: number; error?: string }> {
  await loadBotRuntime();
  if (!(await enabled())) return { ok: false, sent: 0, total: 0, error: "broadcasts disabled" };

  const p = await dbGet<Product>(`products/${productId}`);
  if (!p) return { ok: false, sent: 0, total: 0, error: "product not found" };
  if (p.hidden && kind !== "flash") return { ok: false, sent: 0, total: 0, error: "product hidden" };

  const text = body(kind, p, extra);
  const site = siteUrl();
  const keyboard = {
    inline_keyboard: [
      [{ text: "🛒 Buy now", callback_data: `p:${productId}` }],
      [
        { text: "🏬 Browse shop", callback_data: "products" },
        ...(site ? [{ text: "🌐 Website", url: site }] : []),
      ],
    ],
  };

  const users = (await dbGet<Record<string, boolean>>("telegramUsers")) || {};
  const ids = Object.keys(users).map(Number).filter(Boolean);
  let sent = 0;
  for (const id of ids) {
    try {
      const photo = p.logo ? await tgSendPhoto(id, p.logo, text, keyboard) : false;
      if (!photo)
        await tg("sendMessage", {
          chat_id: id,
          text,
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
      sent++;
    } catch {
      /* blocked user */
    }
  }
  await dbPatch(`products/${productId}`, { lastBroadcast: `${kind}:${Date.now()}` });
  return { ok: true, sent, total: ids.length };
}
