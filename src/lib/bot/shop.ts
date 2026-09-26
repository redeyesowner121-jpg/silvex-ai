/** Everything a shopper does in the bot: products, wallet, orders, buying. */
import { defaultDepositAddress } from "@/lib/deposit.server";
import { formatDescription } from "@/lib/format-desc";

import { dbGet, dbPush, dbPut, money, notifyOwners, siteUrl, tg, tgSendPhoto, tgTag } from "@/lib/telegram.server";
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
  if (isOutOfStock(p)) button["style"] = "danger";
  return button;
}

const PAGE_SIZE = 10;

type Entry = { kind: "product"; id: string; p: Product };

const norm = (s: string) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Loose match so "cap" finds "CapCut" and "gemni" still finds "Gemini". */
function matches(haystack: string, query: string) {
  const h = norm(haystack);
  const q = norm(query);
  if (!q) return true;
  return q.split(" ").every((term) => {
    if (!term) return true;
    if (h.includes(term)) return true;
    return h.split(" ").some((word) => {
      if (word.startsWith(term) || term.startsWith(word)) return true;
      if (term.length < 4) return false;
      // allow one typo
      let diff = 0;
      const len = Math.max(word.length, term.length);
      if (Math.abs(word.length - term.length) > 1) return false;
      for (let i = 0, j = 0; i < len; i++, j++) {
        if (word[i] === term[j]) continue;
        if (++diff > 1) return false;
        if (word.length > term.length) j--;
        else if (term.length > word.length) i--;
      }
      return true;
    });
  });
}

/** All visible products, optionally filtered by a search term. */
async function catalog(query = ""): Promise<Entry[]> {
  const entries = await visibleProducts();
  const out: Entry[] = [];
  for (const [id, p] of entries) {
    if (matches(`${p.title || ""} ${(p as any).type || ""}`, query))
      out.push({ kind: "product", id, p });
  }
  return out;
}

const searchButton = () => ({ text: `${be("btn.search")} Search products`, callback_data: "psearch" });

export async function sendProducts(chatId: number, page = 0, query = "") {
  const q = String(query || "").slice(0, 30);
  const entries = await catalog(q);

  if (!entries.length) {
    if (q) {
      // Nobody found anything for this search — let the owners and the log group know.
      void notifyOwners(
        `🔍 <b>Search with no result</b>\nUser: ${await tgTag(chatId)}\nSearched: <b>${q.replace(/</g, "&lt;")}</b>`,
      ).catch(() => undefined);
      return say(
        chatId,
        `🔍 Nothing found for <b>${q.replace(/</g, "&lt;")}</b>.\n\nWe told the store owner — they will add it or reply to you soon.`,
        {
          inline_keyboard: [
            [searchButton()],
            [{ text: "⬅️ Back to Products", callback_data: "products" }],
          ],
        },
      );
    }
    return say(chatId, "No products available right now.", backHome);
  }

  const pages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const current = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const slice = entries.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const move = (n: number) => (q ? `sq:${n}:${q}` : `pg:${n}`);

  // Premium (custom) emoji only render inside message text, never on buttons,
  // so the list itself carries them and the buttons stay plain.
  const lines = slice
    .map((entry) => `${productEmoji(entry.id)} <b>${entry.p.title}</b> — ${money(entry.p.price || 0)}`)
    .join("\n");

  const nav: { text: string; callback_data: string }[] = [];
  if (current > 0) nav.push({ text: `${be("btn.prev")} Previous Page`, callback_data: move(current - 1) });
  if (current < pages - 1) nav.push({ text: `Next Page ${be("btn.next")}`, callback_data: move(current + 1) });

  const header = q ? `🔍 <b>Results for “${q.replace(/</g, "&lt;")}”</b>` : `${em("btn.products")} <b>Products</b>`;

  await say(
    chatId,
    `${header}\n\n${lines}\n\nPage <b>${current + 1}</b> of <b>${pages}</b> — tap any item below to see details.`,
    {
      inline_keyboard: [
        ...slice.map((entry) => [listButton(entry.id, entry.p)]),
        ...(nav.length ? [nav] : []),
        [searchButton()],
        [{ text: "⬅️ Back to Shop", callback_data: "home" }],
      ],
    },
  );
}

/** Asks the shopper what they are looking for. */
export async function askProductSearch(chatId: number) {
  const { setState } = await import("./core");
  await setState(chatId, { k: "prod_search" });
  return say(chatId, "🔍 Send what you are looking for (for example <code>cap</code> for CapCut).", {
    inline_keyboard: [[{ text: "⬅️ Back to Products", callback_data: "products" }]],
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
  const availability = isOutOfStock(p)
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
      ...(isOutOfStock(p)
        ? [[{ text: "🚫 Out of stock", callback_data: `p:${id}` }]]
        : [[{ text: `🟢 ${be("btn.buy")} Buy now — ${money(p.price || 0)}`, callback_data: `b:${id}` }]]),
      [
        { text: `🔵 ${be("btn.back")} Back to Products`, callback_data: "products" },
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
  if (isOutOfStock(p))
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
    { inline_keyboard: [...rows, [{ text: "⬅️ Back to Product", callback_data: `p:${productId}` }]] },
  );
}

/** Shows how the buyer can pay for the chosen quantity. */
export async function askPayMethod(chatId: number, productId: string, qty: number) {
  const p = await dbGet<Product>(`products/${productId}`);
  if (!p) return say(chatId, "Product not found.", backHome);
  if (isOutOfStock(p))
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
  rows.push([{ text: "⬅️ Back to Quantity", callback_data: `bq:${productId}:${qty}` }]);
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
  if (isOutOfStock(p))
    return say(chatId, "This product is out of stock right now.", backHome);
  const total = Math.round(Number(p.price || 0) * qty * 100) / 100;
  await say(
    chatId,
    `${productEmoji(productId)} <b>Confirm your order</b>\n\n${p.title}\nQuantity: <b>${qty}</b>\nTotal: <b>${money(total)}</b>\n\nThis amount will be taken from your wallet.`,
    {
      inline_keyboard: [
        [{ text: `${productEmojiChar(productId)} Confirm & pay`, callback_data: `bgo:${productId}:${qty}` }],
        [{ text: "⬅️ Back to Payment Methods", callback_data: `bpm:${productId}:${qty}` }],
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
  if (isOutOfStock(p))
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
  // Delivery receipt files removed — the message above already carries the content.
  if (!user.email) {
    await askEmail(chatId, "Add your email to also receive this order and its delivery details by mail.");
  }

  await notifyOwners(
    `🛒 <b>New Telegram order</b>\n${p.title}\nBuyer: ${await tgTag(chatId)}${user.email ? ` (${user.email})` : ""}\nTotal: ${money(price)}\nOrder: ${orderId}\nStatus: ${complete ? "Completed" : "Pending"}`,
  );
}
