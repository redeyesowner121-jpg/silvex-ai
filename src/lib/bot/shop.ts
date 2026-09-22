/** Everything a shopper does in the bot: products, wallet, orders, buying. */
import { defaultDepositAddress } from "@/lib/deposit.server";
import { formatDescription } from "@/lib/format-desc";

import { dbGet, dbPush, dbPut, money, notifyOwners, sendDeliveryFiles, siteUrl, tg, tgSendPhoto } from "@/lib/telegram.server";
import { be, e as em, productEmoji, productEmojiChar } from "@/lib/emoji.server";
import { allProducts, askEmail, backHome, cfg, editTarget, ensureUser, invalidateProducts, invalidateUsers, say, type Product } from "./core";
import { payReferralCommission } from "./wallet";

export { defaultDepositAddress };
export {
  sendWallet,
  walletHistory,
  startDeposit,
  startCardDeposit,
  createCardLink,
  payProductByCard,
  checkCardPayment,
  startWithdraw,
  sendProfile,
  sendApiKey,
  sendApiDocsFile,
  sendOrders,
  sendReviews,
  submitReview,
  payReferralCommission,
  applyStartReferral,
  sendRefer,
  sendSupport,
} from "./wallet";

const slugOf = (name: string) =>
  String(name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

async function visibleProducts() {
  const all = await allProducts();
  return Object.entries(all).filter(
    ([, p]) => p && (p as any).hidden !== true && String(p.title || "").trim() !== "",
  ) as [string, Product][];
}

/** Live stock count by delivery mode (matches the detail view). */
function stockCount(p: Product): number | null {
  const anyP = p as unknown as { delivery?: string; supplierStock?: number; soldOut?: boolean };
  if (anyP.soldOut) return 0;
  if (anyP.delivery === "auto") return Array.isArray(p.stock) ? p.stock.filter(Boolean).length : 0;
  if (anyP.delivery === "supplier") return Number(anyP.supplierStock || 0);
  if (anyP.delivery === "manual") return null; // no countable stock
  return Infinity; // repeat = unlimited
}

const isOutOfStock = (p: Product) => stockCount(p) === 0;

/** Button label: emoji + name + price + stock, red when unavailable. */
function listButton(id: string, p: Product) {
  const stock = stockCount(p);
  const stockPart =
    stock === null ? "" : stock === Infinity ? " | ♾️" : ` | 📦 ${stock}`;
  const button: Record<string, unknown> = {
    text: `${productEmojiChar(id)} ${p.title} | ${money(p.price || 0)}${stockPart}`,
    callback_data: `p:${id}`,
  };
  if (isOutOfStock(p)) button.style = "danger";
  return button;
}

export async function sendProducts(chatId: number) {
  const entries = await visibleProducts();
  if (!entries.length) return say(chatId, "No products available right now.", backHome);

  // Products sharing a folder name are shown once as a folder of variations.
  const folders = new Map<string, { name: string; items: [string, Product][] }>();
  const singles: [string, Product][] = [];
  for (const entry of entries) {
    const name = String((entry[1] as any).group || "").trim();
    if (!name) {
      singles.push(entry);
      continue;
    }
    const slug = slugOf(name);
    const found = folders.get(slug);
    if (found) found.items.push(entry);
    else folders.set(slug, { name, items: [entry] });
  }

  const folderList = [...folders.entries()];
  const list = singles.slice(0, Math.max(0, 40 - folderList.length));

  // Premium (custom) emoji only render inside message text, never on buttons,
  // so the list itself carries them and the buttons stay plain.
  const lines = [
    ...folderList.map(
      ([, f]) =>
        `📁 <b>${f.name}</b> — ${f.items.length} plans from ${money(
          Math.min(...f.items.map(([, p]) => Number(p.price) || 0)),
        )}`,
    ),
    ...list.map(([id, p]) => `${productEmoji(id)} <b>${p.title}</b> — ${money(p.price || 0)}`),
  ].join("\n");

  await say(chatId, `${em("btn.products")} <b>Products</b>\n\n${lines}\n\nTap any item below to see details.`, {
    inline_keyboard: [
      ...folderList.map(([slug, f]) => [
        { text: `📁 ${f.name} — ${f.items.length} plans`, callback_data: `g:${slug}` },
      ]),
      ...list.map(([id, p]) => [listButton(id, p)]),
    ],
  });
}

/** Opens one folder and lists every plan variation inside it. */
export async function sendGroup(chatId: number, slug: string) {
  const entries = (await visibleProducts()).filter(
    ([, p]) => slugOf(String((p as any).group || "")) === slug,
  );
  if (!entries.length) return sendProducts(chatId);
  const name = String((entries[0]![1] as any).group || "Plans").trim();
  const list = entries.slice(0, 40);
  const lines = list
    .map(([id, p]) => `${productEmoji(id)} <b>${p.title}</b> — ${money(p.price || 0)}`)
    .join("\n");

  await say(chatId, `📁 <b>${name}</b>\n\n${lines}\n\nPick the plan you want.`, {
    inline_keyboard: [
      ...list.map(([id, p]) => [
        { text: `${productEmojiChar(id)} ${p.title} — ${money(p.price || 0)}`, callback_data: `p:${id}` },
      ]),
      [{ text: `🔵 ${be("btn.back")} Products`, callback_data: "products" }],
    ],
  });
}

export async function sendProduct(chatId: number, id: string) {
  const p = await dbGet<Product>(`products/${id}`);
  if (!p) return say(chatId, "Product not found.", backHome);

  const stock = Array.isArray(p.stock) ? p.stock.filter(Boolean).length : 0;
  const stockLine =
    p.delivery === "auto"
      ? `${em("norm.box")} Stock: <b>${stock}</b>`
      : p.delivery === "supplier"
        ? `${em("norm.box")} Stock: <b>${Number(p.supplierStock || 0)}</b>`
        : p.delivery === "repeat"
          ? `${em("norm.box")} Stock: <b>Unlimited</b>`
          : `${em("norm.clock")} Manual delivery`;
  const availability = (p as any).soldOut
    ? `\n${em("norm.box")} <b>Out of stock</b>`
    : p.delivery === "manual"
      ? ""
      : `\n${em("norm.fast")} Instant delivery`;
  const sold = Number((p as any).salesCount || 0);

  const escDesc = formatDescription(String(p.desc || ""))
    .split("\n")
    .map((line) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
    .join("\n");
  const text =
    `${productEmoji(id)} <b>${p.title || "Item"}</b>\n\n` +
    `${em("norm.money")} Price: <b>${money(p.price || 0)}</b>\n` +
    `${stockLine}\n${em("norm.fire")} Total sold: <b>${sold}</b>${availability}` +
    // Description renders as an expandable quote. It must start on its own
    // line after the header block — the quote tag sits directly after the
    // separating newlines so the quote never swallows header text.
    (escDesc ? `\n\n<blockquote expandable>${escDesc}</blockquote>` : "");

  const keyboard = {
    inline_keyboard: [
      ...((p as any).soldOut
        ? [[{ text: "🚫 Out of stock", callback_data: `p:${id}` }]]
        : [[{ text: `🟢 ${be("btn.buy")} Buy now — ${money(p.price || 0)}`, callback_data: `b:${id}` }]]),
      [
        { text: `🔵 ${be("btn.back")} Products`, callback_data: "products" },
        { text: `🟣 ${be("btn.wallet")} Wallet`, callback_data: "wallet" },
      ],
    ],
  };
  if (p.logo) {
    editTarget.delete(chatId);
    const sent = await tgSendPhoto(chatId, p.logo, text, keyboard);
    if (sent) return;
  }
  await say(chatId, text, keyboard);
}

async function maxQty(p: Product) {
  const anyP = p as unknown as { delivery?: string; supplierStock?: number };
  const stock = Array.isArray(p.stock) ? p.stock.filter(Boolean).length : 0;
  const available =
    anyP.delivery === "auto"
      ? stock
      : anyP.delivery === "supplier"
        ? Number(anyP.supplierStock || 0)
        : 20;
  return Math.max(1, Math.min(20, available || 1));
}

/** Asks how many copies the buyer wants. Buttons hold numbers only; the price is in the text. */
export async function askQty(chatId: number, productId: string, qty = 1) {
  const p = await dbGet<Product>(`products/${productId}`);
  if (!p) return say(chatId, "Product not found.", backHome);
  if ((p as any).soldOut)
    return say(chatId, "This product is out of stock right now.", backHome);
  const price = Number(p.price || 0);
  const max = await maxQty(p);
  const count = Math.max(1, Math.min(Math.floor(Number(qty) || 1), max));
  const choices = [1, 3, 5, 10, 20].filter((n) => n <= max);
  if (!choices.length) choices.push(1);
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < choices.length; i += 3) {
    rows.push(
      choices.slice(i, i + 3).map((n) => ({
        text: n === count ? `${productEmojiChar(productId)} ${n}` : `${n}`,
        callback_data: `bq:${productId}:${n}`,
      })),
    );
  }
  rows.push([{ text: "✏️ Custom number", callback_data: `bqc:${productId}` }]);
  rows.push([{ text: "➡️ Continue", callback_data: `bpm:${productId}:${count}` }]);
  await say(
    chatId,
    `${productEmoji(productId)} <b>${p.title}</b>\n\n` +
      `Price: <b>${money(price)}</b> each\n` +
      `Selected quantity: <b>${count}</b>\n` +
      `Total: <b>${money(Math.round(price * count * 100) / 100)}</b>\n\n` +
      `Pick another quantity if you like (1–${max}), then press Continue.`,
    { inline_keyboard: [...rows, [{ text: "⬅️ Back", callback_data: `p:${productId}` }]] },
  );
}

/** Shows how the buyer can pay for the chosen quantity. */
export async function askPayMethod(chatId: number, productId: string, qty: number) {
  const p = await dbGet<Product>(`products/${productId}`);
  if (!p) return say(chatId, "Product not found.", backHome);
  if ((p as any).soldOut)
    return say(chatId, "This product is out of stock right now.", backHome);
  const uid = await ensureUser(chatId);
  const user = (await dbGet<any>(`users/${uid}`)) || {};
  const wallet = Number(user.wallet || 0);
  const total = Math.round(Number(p.price || 0) * qty * 100) / 100;
  const c = await cfg();
  const rows: any[] = [
    [{ text: `💰 Wallet (${money(wallet)})`, callback_data: `bcf:${productId}:${qty}` }],
  ];
  if (String(c.razorpayKeyId || "").trim())
    rows.push([{ text: "💳 Card / UPI", callback_data: `pbc:${productId}:${qty}` }]);
  rows.push([{ text: "🪙 Crypto (USDT)", callback_data: "dep" }]);
  rows.push([{ text: "⬅️ Back", callback_data: `bq:${productId}:${qty}` }]);
  await say(
    chatId,
    `💳 <b>Payment method</b>\n\n${productEmoji(productId)} ${p.title}\nQuantity: <b>${qty}</b>\nTotal: <b>${money(total)}</b>\n` +
      `Wallet balance: ${money(wallet)}\n\n` +
      (wallet < total
        ? "Your wallet is short for this order — top it up with card or crypto first."
        : "Choose how you want to pay."),
    { inline_keyboard: rows },
  );
}

/** Final confirmation, only needed when paying from the wallet. */
export async function confirmWalletPay(chatId: number, productId: string, qty: number) {
  const p = await dbGet<Product>(`products/${productId}`);
  if (!p) return say(chatId, "Product not found.", backHome);
  if ((p as any).soldOut)
    return say(chatId, "This product is out of stock right now.", backHome);
  const total = Math.round(Number(p.price || 0) * qty * 100) / 100;
  await say(
    chatId,
    `${productEmoji(productId)} <b>Confirm your order</b>\n\n${p.title}\nQuantity: <b>${qty}</b>\nTotal: <b>${money(total)}</b>\n\nThis amount will be taken from your wallet.`,
    {
      inline_keyboard: [
        [{ text: `${productEmojiChar(productId)} Confirm & pay`, callback_data: `bgo:${productId}:${qty}` }],
        [{ text: "⬅️ Back", callback_data: `bpm:${productId}:${qty}` }],
      ],
    },
  );
}

export async function buy(chatId: number, productId: string, qty = 1) {
  const uid = await ensureUser(chatId);
  const [p, storedUser] = await Promise.all([
    dbGet<Product>(`products/${productId}`),
    dbGet<any>(`users/${uid}`),
  ]);
  if (!p) return say(chatId, "Product not found.", backHome);
  if ((p as any).soldOut)
    return say(chatId, "This product is out of stock right now.", backHome);
  const count = Math.max(1, Math.min(Math.floor(Number(qty) || 1), 20));
  const unitPrice = Number(p.price || 0);
  const price = Math.round(unitPrice * count * 100) / 100;
  const user = storedUser || {};
  const wallet = Number(user.wallet || 0);
  if (wallet < price) {
    return say(chatId, `Not enough wallet balance. You have ${money(wallet)}, this order costs ${money(price)}.`, {
      inline_keyboard: [[{ text: `🟢 ${be("btn.deposit")} Deposit`, callback_data: "dep" }]],
    });
  }

  const delivered: { title: string; content: string }[] = [];
  let complete = false;
  if (p.delivery === "supplier") {
    try {
      const { supplierBuy } = await import("@/lib/supplier.server");
      const items = await supplierBuy(
        p.supplierId ?? "",
        count,
        `tg-${chatId}-${Date.now()}`,
        String(p.provider || "custom"),
      );
      for (const content of items) {
        await dbPush(`usedStock/${productId}`, {
          content,
          orderId: "",
          email: user.email || `tg:${chatId}`,
          date: new Date().toISOString(),
        });
        delivered.push({ title: p.title || "Item", content });
      }
      complete = delivered.length > 0;
    } catch {
      complete = false;
    }
  } else if (p.delivery === "repeat" && p.link) {
    for (let i = 0; i < count; i++) delivered.push({ title: p.title || "Item", content: p.link });
    complete = true;
  } else if (p.delivery === "auto") {
    const stock = Array.isArray(p.stock) ? p.stock.filter(Boolean) : [];
    if (stock.length >= count) {
      const taken = stock.slice(0, count) as string[];
      await dbPut(`products/${productId}/stock`, stock.slice(count));
      for (const content of taken) {
        await dbPush(`usedStock/${productId}`, {
          content,
          orderId: "",
          email: user.email || `tg:${chatId}`,
          date: new Date().toISOString(),
        });
        delivered.push({ title: p.title || "Item", content });
      }
      complete = true;
    }
  }

  const orderId = "ORD" + Date.now();
  await dbPut(`users/${uid}/wallet`, Math.round((wallet - price) * 100) / 100);
  await dbPut(`orders/${orderId}`, {
    orderId,
    uid,
    email: user.email || "",
    items: [{ ...p, id: productId, qty: count, price: unitPrice }],
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
  await dbPut(`products/${productId}/salesCount`, Number(p.salesCount || 0) + count);
  invalidateProducts();
  invalidateUsers();
  await payReferralCommission(uid, price);

  const body = complete
    ? `✅ <b>Order delivered</b>\n\n${delivered.map((d) => `${d.title}\n<code>${d.content}</code>`).join("\n\n")}`
    : `🧾 <b>Order placed</b>\n\n${p.title}\nWe will deliver it shortly.`;
  await say(chatId, `${body}\n\nOrder: <code>${orderId}</code>\nPaid: ${money(price)}\n\n🌐 Website: ${siteUrl()}`, {
    inline_keyboard: [
      [{ text: "🌐 Visit website", url: siteUrl() }],
      [{ text: "🛍 Buy more", callback_data: "products" }],
    ],
  });
  if (complete) await sendDeliveryFiles(chatId, orderId, delivered);
  if (!user.email) {
    await askEmail(chatId, "Add your email to also receive this order and its delivery details by mail.");
  }

  await notifyOwners(
    `🛒 <b>New Telegram order</b>\n${p.title}\nBuyer: ${user.email || chatId}\nTotal: ${money(price)}\nOrder: ${orderId}\nStatus: ${complete ? "Completed" : "Pending"}`,
  );
}
