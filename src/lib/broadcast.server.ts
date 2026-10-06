/** Server-only store announcements pushed to every Telegram bot user. */
import {
  dbGet,
  dbPatch,
  loadBotRuntime,
  money,
  siteUrl,
  tg,
  tgSendPhoto,
  telegramPhotoId,
  ownerIds,
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

function body(kind: BroadcastKind, p: Product, extra: { price?: number; left?: number; ends?: number; added?: number }) {
  const title = p.title || "New item";
  const price = money(Number(extra.price ?? p.price ?? 0));
  switch (kind) {
    case "new":
      return `🆕 <b>New product available</b>\n\n<b>${title}</b>\nPrice: ${price}\n\nTap below to grab it.`;
    case "restock":
      return extra.added
        ? `☁️ <b>${title}</b>\n\n➕ Added: <b>${extra.added}</b>\n📦 Current stock: <b>${extra.left ?? stockOf(p)}</b>\n💰 Price: <b>${price}</b>`
        : `☁️ <b>${title}</b>\n\n📦 Back in stock: <b>${extra.left ?? stockOf(p)}</b>\n💰 Price: <b>${price}</b>`;
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
  extra: { price?: number; left?: number; ends?: number; added?: number } = {},
  adminChatId?: number,
): Promise<{ ok: boolean; sent: number; total: number; error?: string }> {
  await loadBotRuntime();
  if (!(await enabled())) return { ok: false, sent: 0, total: 0, error: "broadcasts disabled" };

  const p = await dbGet<Product>(`products/${productId}`);
  if (!p) return { ok: false, sent: 0, total: 0, error: "product not found" };
  if (p.hidden && kind !== "flash") return { ok: false, sent: 0, total: 0, error: "product hidden" };

  const text = body(kind, p, extra);
  void import("./push.server")
    .then(({ pushEveryone, plain }) => {
      const [title, ...rest] = plain(text).split("\n");
      return pushEveryone({ title: title || "Silvex AI", body: rest.join("\n").trim(), url: "/products" });
    })
    .catch(() => undefined);
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

  // Upload the photo once (to an owner chat) so every user gets the cached file id.
  let photoId: string | null = null;
  if (p.logo) {
    photoId = await telegramPhotoId(p.logo);
    const first = adminChatId ?? ownerIds()[0];
    if (!photoId && first && (await tgSendPhoto(first, p.logo, text, keyboard))) photoId = await telegramPhotoId(p.logo);
  }
  const { runBroadcast } = await import("./broadcast-runner.server");
  const labels: Record<BroadcastKind, string> = { new: "New product", restock: "New stock", low: "Low stock", flash: "Flash sale" };
  const r = await runBroadcast({
    label: `${labels[kind]} · ${p.title || productId}`,
    adminChatId,
    send: async (id, extra) => {
      if (photoId) {
        await tg("sendPhoto", { chat_id: id, photo: photoId, caption: text, parse_mode: "HTML", reply_markup: keyboard, ...extra });
        return;
      }
      await tg("sendMessage", { chat_id: id, text, parse_mode: "HTML", reply_markup: keyboard, ...extra });
    },
  });
  await dbPatch(`products/${productId}`, { lastBroadcast: `${kind}:${Date.now()}` });
  return { ok: true, sent: r.sent, total: r.total };
}

/** One combined announcement for several products (used by supplier syncs). */
export async function announceDigest(
  list: { kind: "new" | "restock"; id: string; left: number; added?: number }[],
): Promise<{ ok: boolean; sent: number; total: number; error?: string }> {
  await loadBotRuntime();
  if (!(await enabled())) return { ok: false, sent: 0, total: 0, error: "broadcasts disabled" };
  const rows: { id: string; p: Product; a: (typeof list)[number] }[] = [];
  for (const a of list.slice(0, 15)) {
    const p = await dbGet<Product>(`products/${a.id}`);
    if (p && !p.hidden && p.title) rows.push({ id: a.id, p, a });
  }
  if (!rows.length) return { ok: false, sent: 0, total: 0, error: "nothing to announce" };
  if (rows.length === 1) {
    const { id, a } = rows[0]!;
    return announce(a.kind, id, { left: a.left, ...(a.added ? { added: a.added } : {}) });
  }
  const lines = rows.map(({ p, a }) => {
    const tag = a.kind === "new" ? "🆕" : a.added ? `➕ ${a.added}` : "🔄";
    return `☁️ <b>${p.title}</b>\n${tag} • 📦 ${a.left >= 9999 ? "In stock" : a.left} • 💰 ${money(Number(p.price || 0))}`;
  });
  const text = `📦 <b>Stock update</b>\n\n${lines.join("\n\n")}`;
  const site = siteUrl();
  const keyboard = {
    inline_keyboard: [
      ...rows.slice(0, 8).map(({ id, p }) => [{ text: `🛒 ${String(p.title).slice(0, 40)}`, callback_data: `p:${id}` }]),
      [
        { text: "🏬 Browse shop", callback_data: "products" },
        ...(site ? [{ text: "🌐 Website", url: site }] : []),
      ],
    ],
  };
  const { runBroadcast } = await import("./broadcast-runner.server");
  const r = await runBroadcast({
    label: `Stock update · ${rows.length} products`,
    send: async (id, extra) => {
      await tg("sendMessage", { chat_id: id, text, parse_mode: "HTML", reply_markup: keyboard, ...extra });
    },
  });
  const now = Date.now();
  await Promise.all(rows.map(({ id, a }) => dbPatch(`products/${id}`, { lastBroadcast: `${a.kind}:${now}` })));
  return { ok: true, sent: r.sent, total: r.total };
}
