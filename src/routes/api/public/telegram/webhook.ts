import { createFileRoute } from "@tanstack/react-router";
import {
  dbGet,
  dbPatch,
  dbPush,
  dbPut,
  money,
  notifyOwners,
  safeEqual,
  SITE_URL,
  telegramWebhookSecret,
  tg,
  TELEGRAM_OWNER_IDS,
} from "@/lib/telegram.server";

type Product = {
  id?: string;
  title?: string;
  desc?: string;
  price?: number;
  link?: string;
  delivery?: "auto" | "repeat" | "manual";
  stock?: string[];
  salesCount?: number;
};

async function siteName(): Promise<string> {
  const cfg = await dbGet<{ siteName?: string }>("settings/config");
  return cfg?.siteName || "SILENT SELLER";
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🛍 View Products", callback_data: "products" }],
      [
        { text: "👛 My Wallet", callback_data: "wallet" },
        { text: "👤 Profile", callback_data: "profile" },
      ],
      [
        { text: "⭐ Reviews", callback_data: "reviews" },
        { text: "🎁 Refer & Earn", callback_data: "refer" },
      ],
      [
        { text: "🆘 Support", callback_data: "support" },
        { text: "🧾 My Orders", callback_data: "orders" },
      ],
      [{ text: "🌐 Visit Website", url: SITE_URL }],
    ],
  };
}

async function welcome(chatId: number) {
  const name = await siteName();
  const text =
    `🎬 <b>Welcome to ${name} !</b>\n\n` +
    `🌟 Premium digital products at the cheapest prices\n` +
    `⚡ Instant delivery\n` +
    `🔒 Secure payments\n` +
    `🎧 24/7 Support\n\n` +
    `Choose an option below:`;
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: mainKeyboard(),
  });
}

async function linkedUid(chatId: number): Promise<string | null> {
  return await dbGet<string>(`telegramLinks/${chatId}`);
}

async function sendProducts(chatId: number) {
  const all = (await dbGet<Record<string, Product>>("products")) || {};
  const list = Object.entries(all).slice(0, 40);
  if (!list.length) {
    await tg("sendMessage", { chat_id: chatId, text: "No products available right now." });
    return;
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text: "🛍 <b>Products</b>\nTap any item to see details.",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        ...list.map(([id, p]) => [
          { text: `${p.title || "Item"} — ${money(p.price || 0)}`, callback_data: `p:${id}` },
        ]),
        [{ text: "⬅️ Back", callback_data: "home" }],
      ],
    },
  });
}

async function sendProduct(chatId: number, id: string) {
  const p = await dbGet<Product>(`products/${id}`);
  if (!p) {
    await tg("sendMessage", { chat_id: chatId, text: "Product not found." });
    return;
  }
  const stock = Array.isArray(p.stock) ? p.stock.filter(Boolean).length : 0;
  const availability =
    p.delivery === "auto" ? `📦 In stock: ${stock}` : p.delivery === "repeat" ? "⚡ Instant delivery" : "🕐 Manual delivery";
  await tg("sendMessage", {
    chat_id: chatId,
    text: `<b>${p.title || "Item"}</b>\n\n${p.desc || ""}\n\n💵 Price: <b>${money(p.price || 0)}</b>\n${availability}`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: `Buy now — ${money(p.price || 0)}`, callback_data: `b:${id}` }],
        [
          { text: "⬅️ Products", callback_data: "products" },
          { text: "🌐 Website", url: SITE_URL },
        ],
      ],
    },
  });
}

async function sendWallet(chatId: number) {
  const uid = await linkedUid(chatId);
  if (!uid) return askLink(chatId);
  const wallet = (await dbGet<number>(`users/${uid}/wallet`)) || 0;
  await tg("sendMessage", {
    chat_id: chatId,
    text: `👛 <b>Wallet</b>\n\nBalance: <b>${money(wallet)}</b>\n\nAdd funds from the website wallet page.`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "💳 Add funds on website", url: `${SITE_URL}/wallet` }],
        [{ text: "⬅️ Back", callback_data: "home" }],
      ],
    },
  });
}

async function sendProfile(chatId: number) {
  const uid = await linkedUid(chatId);
  if (!uid) return askLink(chatId);
  const u = await dbGet<any>(`users/${uid}`);
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      `👤 <b>Profile</b>\n\n` +
      `Name: ${u?.name || "-"}\n` +
      `Email: ${u?.email || "-"}\n` +
      `Wallet: ${money(u?.wallet || 0)}\n` +
      `Referral code: <code>${u?.myRefCode || "-"}</code>`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🌐 Open profile on website", url: `${SITE_URL}/profile` }],
        [{ text: "⬅️ Back", callback_data: "home" }],
      ],
    },
  });
}

async function sendOrders(chatId: number) {
  const uid = await linkedUid(chatId);
  if (!uid) return askLink(chatId);
  const all = (await dbGet<Record<string, any>>("orders")) || {};
  const mine = Object.values(all)
    .filter((o: any) => o?.uid === uid)
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8);
  if (!mine.length) {
    await tg("sendMessage", { chat_id: chatId, text: "You have no orders yet." });
    return;
  }
  const text = mine
    .map((o: any) => {
      const items = (o.items || []).map((i: any) => `${i.title} x${i.qty || 1}`).join(", ");
      return `🧾 <b>${o.orderId}</b>\n${items}\n${money(o.total)} • ${o.status}`;
    })
    .join("\n\n");
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🌐 See all on website", url: `${SITE_URL}/orders` }],
        [{ text: "⬅️ Back", callback_data: "home" }],
      ],
    },
  });
}

async function sendReviews(chatId: number) {
  const all = (await dbGet<Record<string, any>>("reviews")) || {};
  const list = Object.values(all).slice(-5).reverse();
  const text = list.length
    ? list.map((r: any) => `⭐ ${r.rating || 5}/5 — ${r.text || r.message || ""}`).join("\n\n")
    : "No reviews yet.";
  await tg("sendMessage", {
    chat_id: chatId,
    text: `⭐ <b>Reviews</b>\n\n${text}`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "home" }]] },
  });
}

async function sendRefer(chatId: number) {
  const uid = await linkedUid(chatId);
  if (!uid) return askLink(chatId);
  const code = (await dbGet<string>(`users/${uid}/myRefCode`)) || "-";
  await tg("sendMessage", {
    chat_id: chatId,
    text: `🎁 <b>Refer & Earn</b>\n\nYour code: <code>${code}</code>\nShare this link:\n${SITE_URL}/?ref=${code}`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "⬅️ Back", callback_data: "home" }]] },
  });
}

async function sendSupport(chatId: number) {
  const cfg = await dbGet<{ supportLink?: string }>("settings/config");
  const rows: any[] = [];
  if (cfg?.supportLink) rows.push([{ text: "💬 Contact support", url: cfg.supportLink }]);
  rows.push([{ text: "⬅️ Back", callback_data: "home" }]);
  await tg("sendMessage", {
    chat_id: chatId,
    text: "🆘 <b>Support</b>\n\nWe reply 24/7. You can also message us on the website.",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function askLink(chatId: number) {
  await dbPut(`telegramState/${chatId}`, "await_email");
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      "🔗 <b>Connect your store account</b>\n\nSend the email address you use on the website, so your wallet and orders stay the same in both places.",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: [[{ text: "🌐 Create account", url: SITE_URL }]] },
  });
}

async function tryLink(chatId: number, email: string) {
  const users = (await dbGet<Record<string, any>>("users")) || {};
  const hit = Object.entries(users).find(
    ([, u]: [string, any]) => String(u?.email || "").toLowerCase() === email.toLowerCase(),
  );
  if (!hit) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "No account found with that email. Create one on the website first, then send the email again.",
      reply_markup: { inline_keyboard: [[{ text: "🌐 Open website", url: SITE_URL }]] },
    });
    return;
  }
  const [uid] = hit;
  await dbPut(`telegramLinks/${chatId}`, uid);
  await dbPatch(`users/${uid}`, { telegramChatId: chatId });
  await dbPut(`telegramState/${chatId}`, null);
  await tg("sendMessage", {
    chat_id: chatId,
    text: "✅ Account connected. Your wallet, orders and referrals are now shared with the website.",
    reply_markup: mainKeyboard(),
  });
}

async function buy(chatId: number, productId: string) {
  const uid = await linkedUid(chatId);
  if (!uid) return askLink(chatId);
  const p = await dbGet<Product>(`products/${productId}`);
  if (!p) {
    await tg("sendMessage", { chat_id: chatId, text: "Product not found." });
    return;
  }
  const price = Number(p.price || 0);
  const user = (await dbGet<any>(`users/${uid}`)) || {};
  const wallet = Number(user.wallet || 0);
  if (wallet < price) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `Not enough wallet balance. You have ${money(wallet)}, the item costs ${money(price)}.`,
      reply_markup: { inline_keyboard: [[{ text: "💳 Add funds", url: `${SITE_URL}/wallet` }]] },
    });
    return;
  }

  const delivered: { title: string; content: string }[] = [];
  let complete = false;
  if (p.delivery === "repeat" && p.link) {
    delivered.push({ title: p.title || "Item", content: p.link });
    complete = true;
  } else if (p.delivery === "auto") {
    const stock = Array.isArray(p.stock) ? p.stock.filter(Boolean) : [];
    if (stock.length >= 1) {
      const taken = stock[0] as string;
      await dbPut(`products/${productId}/stock`, stock.slice(1));
      await dbPush(`products/${productId}/usedStock`, {
        content: taken,
        orderId: "",
        email: user.email || `tg:${chatId}`,
        date: new Date().toISOString(),
      });
      delivered.push({ title: p.title || "Item", content: taken });
      complete = true;
    }
  }

  const orderId = "ORD" + Date.now();
  await dbPut(`users/${uid}/wallet`, wallet - price);
  await dbPut(`orders/${orderId}`, {
    orderId,
    uid,
    email: user.email || "",
    items: [{ ...p, id: productId, qty: 1, price }],
    subTotal: price,
    couponDiscount: 0,
    couponCode: null,
    total: price,
    phone: user.phone || "",
    note: "Ordered from Telegram bot",
    source: "telegram",
    telegramChatId: chatId,
    delivered,
    status: complete ? "Completed" : "Pending",
    date: new Date().toISOString(),
  });
  await dbPush(`users/${uid}/history`, {
    type: "Purchase",
    amount: price,
    desc: `Order ${orderId.slice(-4)}`,
    date: new Date().toISOString(),
  });
  await dbPut(`products/${productId}/salesCount`, Number(p.salesCount || 0) + 1);

  const body = complete
    ? `✅ <b>Order delivered</b>\n\n${delivered.map((d) => `${d.title}\n<code>${d.content}</code>`).join("\n\n")}`
    : `🧾 <b>Order placed</b>\n\n${p.title}\nWe will deliver it shortly.`;
  await tg("sendMessage", {
    chat_id: chatId,
    text: `${body}\n\nOrder: <code>${orderId}</code>\nPaid: ${money(price)}\n\n🌐 Website: ${SITE_URL}`,
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🌐 Visit website", url: SITE_URL }],
        [{ text: "🛍 Buy more", callback_data: "products" }],
      ],
    },
  });
  await notifyOwners(
    `🛒 <b>New Telegram order</b>\n${p.title}\nBuyer: ${user.email || chatId}\nTotal: ${money(price)}\nOrder: ${orderId}\nStatus: ${complete ? "Completed" : "Pending"}`,
  );
}

async function handleCallback(chatId: number, data: string) {
  if (data === "home") return welcome(chatId);
  if (data === "products") return sendProducts(chatId);
  if (data === "wallet") return sendWallet(chatId);
  if (data === "profile") return sendProfile(chatId);
  if (data === "orders") return sendOrders(chatId);
  if (data === "reviews") return sendReviews(chatId);
  if (data === "refer") return sendRefer(chatId);
  if (data === "support") return sendSupport(chatId);
  if (data === "link") return askLink(chatId);
  if (data.startsWith("p:")) return sendProduct(chatId, data.slice(2));
  if (data.startsWith("b:")) return buy(chatId, data.slice(2));
}

async function handleText(chatId: number, text: string) {
  const t = text.trim();
  if (t === "/start" || t === "/menu") {
    await dbPut(`telegramState/${chatId}`, null);
    return welcome(chatId);
  }
  if (t === "/link") return askLink(chatId);
  if (t === "/admin" && TELEGRAM_OWNER_IDS.includes(chatId)) {
    const orders = (await dbGet<Record<string, any>>("orders")) || {};
    const list = Object.values(orders);
    const pending = list.filter((o: any) => o.status !== "Completed").length;
    const revenue = list.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
    await tg("sendMessage", {
      chat_id: chatId,
      text: `👑 <b>Owner panel</b>\n\nOrders: ${list.length}\nPending: ${pending}\nRevenue: ${money(revenue)}`,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "🌐 Admin panel", url: `${SITE_URL}/admin` }]] },
    });
    return;
  }
  const state = await dbGet<string>(`telegramState/${chatId}`);
  if (state === "await_email" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
    return tryLink(chatId, t);
  }
  return welcome(chatId);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = telegramWebhookSecret();
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) return new Response("Unauthorized", { status: 401 });

        const update = await request.json();
        try {
          if (update?.callback_query) {
            const cq = update.callback_query;
            await tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => undefined);
            const chatId = cq.message?.chat?.id;
            if (chatId) await handleCallback(Number(chatId), String(cq.data || ""));
          } else {
            const msg = update?.message ?? update?.edited_message;
            const chatId = msg?.chat?.id;
            if (chatId) await handleText(Number(chatId), String(msg.text || ""));
          }
        } catch (err) {
          console.error("telegram webhook error", err);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
