/** Everything a shopper does in the bot: products, wallet, orders, buying. */
import { defaultDepositAddress } from "@/lib/deposit.server";
import {
  botReferralLink,
  referralEarnings,
  referralCap,
  referralPercent,
  referralRate,
  websiteReferralLink,
} from "@/lib/referral";
import {
  dbGet,
  dbPatch,
  dbPush,
  dbPut,
  money,
  notifyOwners,
  sendDeliveryFiles,
  siteUrl,
  tg,
  tgSendPhoto,
} from "@/lib/telegram.server";
import { be, e as em, productEmoji, productEmojiChar } from "@/lib/emoji.server";
import {
  allProducts,
  allUsers,
  askEmail,
  backHome,
  cfg,
  channelLink,
  editTarget,
  ensureUser,
  invalidateProducts,
  invalidateUsers,
  say,
  setState,
  type Product,
} from "./core";

export { defaultDepositAddress };

export async function sendProducts(chatId: number) {
  const all = await allProducts();
  const list = Object.entries(all)
    .filter(([, p]) => p && p.hidden !== true)
    .slice(0, 40);
  if (!list.length) return say(chatId, "No products available right now.", backHome);

  await say(chatId, `${em("btn.products")} <b>Products</b>\nTap any item to see details.`, {
    inline_keyboard: [
      ...list.map(([id, p]) => [
        { text: `${productEmojiChar(id)} ${p.title || "Item"} — ${money(p.price || 0)}`, callback_data: `p:${id}` },
      ]),
      [{ text: `🔵 ${be("btn.back")} Menu`, callback_data: "home" }],
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
  const availability = p.delivery === "manual" ? "" : `\n${em("norm.fast")} Instant delivery`;
  const sold = Number((p as any).salesCount || 0);

  const escDesc = String(p.desc || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const text =
    `${productEmoji(id)} <b>${p.title || "Item"}</b>\n\n` +
    `${em("norm.money")} Price: <b>${money(p.price || 0)}</b>\n` +
    `${stockLine}\n${em("norm.cart") || "🛒"} Total sold: <b>${sold}</b>${availability}` +
    (escDesc ? `\n\n<blockquote expandable>${escDesc}</blockquote>` : "");

  const keyboard = {
    inline_keyboard: [
      [{ text: `🟢 ${be("btn.buy")} Buy now — ${money(p.price || 0)}`, callback_data: `b:${id}` }],
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

export async function sendWallet(chatId: number) {
  const uid = await ensureUser(chatId);
  const wallet = (await dbGet<number>(`users/${uid}/wallet`)) || 0;
  await say(chatId, `👛 <b>Wallet</b>\n\nBalance: <b>${money(wallet)}</b>`, {
    inline_keyboard: [
      [
        { text: `🟢 ${be("btn.deposit")} Deposit`, callback_data: "dep" },
        { text: "➖ Withdraw", callback_data: "wd" },
      ],
      [{ text: "📜 History", callback_data: "whist" }],
      [{ text: "⬅️ Menu", callback_data: "home" }],
    ],
  });
}

export async function walletHistory(chatId: number) {
  const uid = await ensureUser(chatId);
  const h = (await dbGet<Record<string, any>>(`users/${uid}/history`)) || {};
  const list = Object.values(h).slice(-10).reverse();
  const text = list.length
    ? list.map((x: any) => `• ${x.type} ${money(x.amount)} — ${x.desc || ""}`).join("\n")
    : "No transactions yet.";
  await say(chatId, `📜 <b>Wallet history</b>\n\n${text}`, backHome);
}

export async function startDeposit(chatId: number) {
  await ensureUser(chatId);
  const c = await cfg();
  await setState(chatId, { k: "dep_hash" });
  const rows: any[][] = [];
  if (String(c.razorpayKeyId || "").trim()) {
    rows.push([{ text: "💳 Pay by card / UPI", callback_data: "depcard" }]);
  }
  rows.push([{ text: "❌ Cancel", callback_data: "home" }]);
  await say(
    chatId,
    `➕ <b>Deposit</b>\n\nSend USDT / USDC (BEP20 or Polygon) to:\n<code>${c.depositAddress || "-"}</code>\n\nThen send the transaction hash (TXID) here. Payments confirmed within 10 minutes are credited automatically.`,
    { inline_keyboard: rows },
  );
}

export async function startCardDeposit(chatId: number) {
  await ensureUser(chatId);
  const c = await cfg();
  if (!String(c.razorpayKeyId || "").trim()) {
    return say(chatId, "Card / UPI payments are not switched on yet.", backHome);
  }
  const rate = Number(c.inrPerDollar) > 0 ? Number(c.inrPerDollar) : 100;
  const feePct = Number((c as any).razorpayFeePercent);
  const fee = Number.isFinite(feePct) && feePct >= 0 ? feePct : 3;
  await setState(chatId, { k: "dep_card" });
  await say(
    chatId,
    `💳 <b>Card / UPI deposit</b>\n\n₹${rate} = $1, plus a ${fee}% verification fee.\nSend how many dollars you want to add (for example <code>5</code>).`,
    { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "home" }]] },
  );
}

export async function createCardLink(chatId: number, text: string) {
  const usd = Number(String(text).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(usd) || usd <= 0) return say(chatId, "Send a number, like 5.");
  const uid = await ensureUser(chatId);
  const u = (await dbGet<any>(`users/${uid}`)) || {};
  const { createPaymentLink } = await import("@/lib/razorpay.server");
  const res = await createPaymentLink({
    usd,
    uid,
    name: u.name || "",
    email: u.email || "",
    phone: u.phone || "",
    source: "telegram",
    siteUrl: siteUrl(),
  });
  if (!res.ok) return say(chatId, `❌ ${res.error}`, backHome);
  await setState(chatId, null);
  return say(
    chatId,
    `💳 <b>Payment link ready</b>\n\nFor: wallet top-up of ${money(usd)}\nAmount: ₹${res.baseInr.toFixed(2)}\nVerification fee (${res.feePercent}%): ₹${res.feeInr.toFixed(2)}\n<b>Total to pay: ₹${res.inr.toFixed(2)}</b>\n\nPay with any card, UPI or netbanking. Your balance is topped up on its own right after the payment.`,
    {
      inline_keyboard: [
        [{ text: "💳 Pay now", url: res.url }],
        [{ text: "✅ I have paid", callback_data: `pchk:${res.id}` }],
        [{ text: "🏠 Home", callback_data: "home" }],
      ],
    },
  );
}

/** Checks one payment link with Razorpay and tops the wallet up when it is paid. */
export async function checkCardPayment(chatId: number, linkId: string) {
  const uid = await ensureUser(chatId);
  const { settlePaymentLink } = await import("@/lib/razorpay.server");
  const out = await settlePaymentLink(linkId);
  if (out.status === "paid") {
    const wallet = (await dbGet<number>(`users/${uid}/wallet`)) || 0;
    return say(chatId, `✅ <b>Payment received</b>\n\nBalance: <b>${money(out.balance ?? wallet)}</b>`, backHome);
  }
  if (out.status === "pending") {
    return say(chatId, "⏳ The payment has not arrived yet. Pay first, then press “I have paid” again.", {
      inline_keyboard: [
        [{ text: "✅ I have paid", callback_data: `pchk:${linkId}` }],
        [{ text: "🏠 Home", callback_data: "home" }],
      ],
    });
  }
  return say(chatId, `❌ ${out.message}`, backHome);
}

export async function startWithdraw(chatId: number) {
  const uid = await ensureUser(chatId);
  const wallet = (await dbGet<number>(`users/${uid}/wallet`)) || 0;
  await setState(chatId, { k: "wd_amount" });
  await say(
    chatId,
    `➖ <b>Withdraw</b>\n\nAvailable: <b>${money(wallet)}</b>\nSend the amount you want to withdraw in dollars.`,
    { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "home" }]] },
  );
}

export async function sendProfile(chatId: number) {
  const uid = await ensureUser(chatId);
  const u = await dbGet<any>(`users/${uid}`);
  await say(
    chatId,
    `👤 <b>Profile</b>\n\nName: ${u?.name || "-"}\nEmail: ${u?.email || "-"}\nPhone: ${u?.phone || "-"}\nWallet: ${money(u?.wallet || 0)}\nReferral code: <code>${u?.myRefCode || "-"}</code>`,
    {
      inline_keyboard: [
        [{ text: "📧 Set email", callback_data: "setmail" }],
        [{ text: "⬅️ Menu", callback_data: "home" }],
      ],
    },
  );
}

export async function sendApiKey(chatId: number, regenerate: boolean) {
  const uid = await ensureUser(chatId);
  const user = (await dbGet<any>(`users/${uid}`)) || {};
  let key: string | undefined = user.apiKey;
  if (!key || regenerate) {
    if (key) await dbPut(`apiKeys/${key}`, null);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    key = "sk_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await dbPut(`apiKeys/${key}`, uid);
    await dbPatch(`users/${uid}`, { apiKey: key, apiEnabled: true });
    invalidateUsers();
  }
  const base = `${siteUrl()}/api/public/reseller`;
  await say(
    chatId,
    `🔑 <b>Your reseller API key</b>\n\n<code>${key}</code>\n\n` +
      `Base URL: <code>${base}</code>\n` +
      `Auth header: <code>x-api-key: ${key}</code>\n` +
      `Orders are paid from your wallet balance (same wallet as the bot and website).\n\n` +
      `<b>Endpoints</b>\n` +
      `<code>GET  /me</code> — your account\n` +
      `<code>GET  /balance</code> — wallet balance\n` +
      `<code>GET  /products</code> — price list + stock\n` +
      `<code>GET  /orders</code> — your orders\n` +
      `<code>GET  /orders/ORDER_ID</code> — one order\n` +
      `<code>POST /order</code> — buy: <code>{"productId":"ID","qty":1}</code>\n\n` +
      `<b>Example</b>\n` +
      `<code>curl -X POST ${base}/order \\\n -H "x-api-key: ${key}" \\\n -H "content-type: application/json" \\\n -d '{"productId":"ID","qty":1}'</code>\n\n` +
      `Instant items come back inside the order response; manual items stay <i>pending</i> until we deliver them (you get a message here).\n\n` +
      `⚠️ Keep this key private — anyone with it can spend your balance.`,
    {
      inline_keyboard: [
        [{ text: "♻️ Generate new key", callback_data: "apikey_new" }],
        [{ text: "📘 Full docs", url: `${siteUrl()}/api-key` }],
        [{ text: "⬅️ Menu", callback_data: "home" }],
      ],
    },
  );
}

export async function sendOrders(chatId: number) {
  const uid = await ensureUser(chatId);
  const all = (await dbGet<Record<string, any>>("orders")) || {};
  const mine = Object.values(all)
    .filter((o: any) => o?.uid === uid)
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 8);
  if (!mine.length) return say(chatId, "You have no orders yet.", backHome);
  const text = mine
    .map((o: any) => {
      const items = (o.items || []).map((i: any) => `${i.title} x${i.qty || 1}`).join(", ");
      const del = (o.delivered || []).map((d: any) => `\n<code>${d.content}</code>`).join("");
      return `🧾 <b>${o.orderId}</b>\n${items}\n${money(o.total)} • ${o.status}${del}`;
    })
    .join("\n\n");
  await say(chatId, text, {
    inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "home" }]],
  });
}

export async function sendReviews(chatId: number) {
  const c = await cfg();
  const all = (await dbGet<Record<string, any>>("reviews")) || {};
  const list = Object.values(all).slice(-5).reverse();
  const text = list.length
    ? list.map((r: any) => `⭐ ${r.rating || 5}/5 — ${r.text || r.message || ""}`).join("\n\n")
    : "No reviews yet.";
  const rows: any[] = [[{ text: "✍️ Write a review", callback_data: "rev_new" }]];
  if (c.reviewChannel) rows.push([{ text: "📢 Review channel", url: channelLink(c.reviewChannel) }]);
  rows.push([{ text: "⬅️ Menu", callback_data: "home" }]);
  await say(chatId, `⭐ <b>Reviews</b>\n\n${text}`, { inline_keyboard: rows });
}

export async function submitReview(chatId: number, text: string) {
  const uid = await ensureUser(chatId);
  const u = uid ? await dbGet<any>(`users/${uid}`) : null;
  const m = text.match(/^([1-5])\s+(.*)$/s);
  const rating = m ? Number(m[1]) : 5;
  const body = m ? m[2]! : text;
  await dbPush("reviews", {
    uid: uid || null,
    name: u?.name || u?.email || "Telegram user",
    rating,
    text: body,
    date: new Date().toISOString(),
  });
  await setState(chatId, null);
  await say(chatId, "🙏 Thanks for your review!", backHome);
  const c = await cfg();
  if (c.reviewChannel && !c.reviewChannel.startsWith("http")) {
    await tg("sendMessage", {
      chat_id: c.reviewChannel.startsWith("@") ? c.reviewChannel : `@${c.reviewChannel}`,
      text: `⭐ ${rating}/5 — ${body}\n\n— ${u?.name || "Customer"}`,
    }).catch(() => undefined);
  }
}

/* ---------------- referrals ---------------- */

/** Pays the buyer's referrer 2% of the purchase, capped per friend. */
export async function payReferralCommission(buyerUid: string, amount: number) {
  try {
    const refBy = await dbGet<string>(`users/${buyerUid}/refBy`);
    if (!refBy || refBy === buyerUid) return;
    const earnedSoFar = Number((await dbGet<number>(`users/${refBy}/refEarned/${buyerUid}`)) || 0);
    const room = referralCap() - earnedSoFar;
    if (room <= 0) return;
    const commission = Math.min(Math.round(Number(amount) * referralRate() * 100) / 100, room);
    if (commission <= 0) return;
    const w = Number((await dbGet<number>(`users/${refBy}/wallet`)) || 0);
    await dbPut(`users/${refBy}/wallet`, w + commission);
    await dbPut(`users/${refBy}/refEarned/${buyerUid}`, earnedSoFar + commission);
    await dbPush(`users/${refBy}/history`, {
      type: "Referral commission",
      amount: commission,
      desc: `2% from a friend's purchase`,
      date: new Date().toISOString(),
    });
    const chat = await dbGet<number>(`users/${refBy}/telegramChatId`);
    if (chat) {
      await tg("sendMessage", {
        chat_id: chat,
        text: `🎁 You earned ${money(commission)} referral commission from a friend's purchase.`,
        parse_mode: "HTML",
      }).catch(() => undefined);
    }
  } catch {
    /* commission must never break an order */
  }
}

/** Links a new bot user to the referrer whose code came in the /start payload. */
export async function applyStartReferral(uid: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!code) return;
  const me = (await dbGet<any>(`users/${uid}`)) || {};
  if (me.refBy || me.usedRef || me.myRefCode === code) return;
  const users = await allUsers();
  const hit = Object.entries(users).find(
    ([id, u]: [string, any]) => id !== uid && String(u?.myRefCode || "").toUpperCase() === code,
  );
  if (!hit) return;
  await dbPatch(`users/${uid}`, { usedRef: code, refBy: hit[0] });
  invalidateUsers();
}

export async function sendRefer(chatId: number) {
  const uid = await ensureUser(chatId);
  const u = (await dbGet<any>(`users/${uid}`)) || {};
  const code = u.myRefCode || "-";
  const users = await allUsers();
  const invited = Object.values(users).filter(
    (x: any) => String(x?.usedRef || "").toUpperCase() === String(code).toUpperCase(),
  ).length;
  const history = Object.values((await dbGet<Record<string, any>>(`users/${uid}/history`)) || {});
  const e = referralEarnings(history as any);
  await say(
    chatId,
    `🎁 <b>Refer &amp; Earn</b>\n\n` +
      `Earn <b>${referralPercent()}% commission</b> on every purchase your friend makes (up to ${money(referralCap())} per friend)!\n\n` +
      `🔗 <b>Your link:</b>\n${botReferralLink(code)}\n\n` +
      `🤩 <b>Code:</b> <code>${code}</code>\n\n` +
      `👥 <b>Total Referrals:</b> ${invited}\n\n` +
      `📈 <b>Earnings</b>\n` +
      `• Today: ${money(e.today)}\n` +
      `• This Week: ${money(e.week)}\n` +
      `• This Month: ${money(e.month)}\n` +
      `• Total: ${money(e.total)}\n\n` +
      `🌐 Website link: ${websiteReferralLink(code)}`,
    backHome,
  );
}

export async function sendSupport(chatId: number) {
  const c = await cfg();
  const rows: any[] = [];
  if (c.supportLink) rows.push([{ text: "💬 Contact support", url: c.supportLink }]);
  rows.push([{ text: "⬅️ Menu", callback_data: "home" }]);
  await say(chatId, "🆘 <b>Support</b>\n\nWe reply 24/7. You can also message us on the website.", {
    inline_keyboard: rows,
  });
}

/* ---------------- buying ---------------- */

/** How many copies of a product can be bought right now. */
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
  const price = Number(p.price || 0);
  const max = await maxQty(p);
  const count = Math.max(1, Math.min(Math.floor(Number(qty) || 1), max));
  const choices = [1, 3, 5, 10, 20].filter((n) => n <= max);
  if (!choices.length) choices.push(1);
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < choices.length; i += 3) {
    rows.push(
      choices.slice(i, i + 3).map((n) => ({
        text: n === count ? `✅ ${n}` : `${n}`,
        callback_data: `bq:${productId}:${n}`,
      })),
    );
  }
  rows.push([{ text: "✏️ Custom number", callback_data: `bqc:${productId}` }]);
  rows.push([{ text: "➡️ Continue", callback_data: `bpm:${productId}:${count}` }]);
  await say(
    chatId,
    `🛒 <b>${p.title}</b>\n\n` +
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
  const uid = await ensureUser(chatId);
  const user = (await dbGet<any>(`users/${uid}`)) || {};
  const wallet = Number(user.wallet || 0);
  const total = Math.round(Number(p.price || 0) * qty * 100) / 100;
  const c = await cfg();
  const rows: any[] = [
    [{ text: `💰 Wallet (${money(wallet)})`, callback_data: `bcf:${productId}:${qty}` }],
  ];
  if (String(c.razorpayKeyId || "").trim())
    rows.push([{ text: "💳 Card / UPI", callback_data: "depcard" }]);
  rows.push([{ text: "🪙 Crypto (USDT)", callback_data: "dep" }]);
  rows.push([{ text: "⬅️ Back", callback_data: `bq:${productId}:${qty}` }]);
  await say(
    chatId,
    `💳 <b>Payment method</b>\n\n${p.title}\nQuantity: <b>${qty}</b>\nTotal: <b>${money(total)}</b>\n` +
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
  const total = Math.round(Number(p.price || 0) * qty * 100) / 100;
  await say(
    chatId,
    `🧾 <b>Confirm your order</b>\n\n${p.title}\nQuantity: <b>${qty}</b>\nTotal: <b>${money(total)}</b>\n\nThis amount will be taken from your wallet.`,
    {
      inline_keyboard: [
        [{ text: "✅ Confirm & pay", callback_data: `bgo:${productId}:${qty}` }],
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
