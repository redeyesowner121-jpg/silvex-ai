import { createFileRoute } from "@tanstack/react-router";
import { defaultDepositAddress, verifyDepositAnyChain } from "@/lib/deposit.server";
import {
  botReferralLink,
  referralEarnings,
  referralCap,
  applyReferralConfig,
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
  telegramWebhookOk,
  loadBotRuntime,
  tg,
  tgSendPhoto,
  ownerIds,
  applyBotConfig,
} from "@/lib/telegram.server";
import {
  be,
  e as em,
  loadEmojis,
  productEmoji,
  productEmojiChar,
  readEmoji,
  fetchEmojiImage,
  syncEmojiImages,
  setProductEmoji,
  setButtonColors,
  setRule,
  saveRuleImage,
  listRules,
  ruleStats,
  removeRule,
  resetAllEmojis,
  emojiKey,
  productEmojiStats,
  clearProductEmoji,
  EMOJI_SLOTS,

} from "@/lib/emoji.server";
import type { ButtonColorMap } from "@/lib/button-colors";

type Product = {
  id?: string;
  title?: string;
  desc?: string;
  price?: number;
  logo?: string;
  link?: string;
  delivery?: "auto" | "repeat" | "manual" | "supplier";
  supplierId?: string | number;
  supplierStock?: number;
  provider?: string;
  hidden?: boolean;
  locked?: boolean;


  stock?: string[];
  salesCount?: number;
};

type Cfg = {
  siteName?: string;
  supportLink?: string;
  depositAddress?: string;
  forceJoin?: string;
  reviewChannel?: string;
  razorpayKeyId?: string;
  inrPerDollar?: number | string;
  telegramOwners?: string | number[];
};

const CFG = "site_settings/config";
const BOT_CACHE_MS = 30_000;
let cachedCfg: Cfg | null = null;
let cfgLoadedAt = 0;
let cachedButtonColors: ButtonColorMap | null = null;
let colorsLoadedAt = 0;

async function cfg(): Promise<Cfg> {
  if (cachedCfg && Date.now() - cfgLoadedAt < BOT_CACHE_MS) return cachedCfg;
  cachedCfg = (await dbGet<Cfg>(CFG)) || {};
  cfgLoadedAt = Date.now();
  applyBotConfig(cachedCfg as any);
  applyReferralConfig(cachedCfg as any);
  return cachedCfg;
}
async function siteName(): Promise<string> {
  return (await cfg()).siteName || "SILENT SELLER";
}

async function loadBotPresentation(): Promise<void> {
  const now = Date.now();
  await Promise.all([
    loadEmojis().catch(() => undefined),
    now - colorsLoadedAt < BOT_CACHE_MS && cachedButtonColors
      ? Promise.resolve()
      : dbGet<ButtonColorMap>("site_settings/button_colors")
          .then((colors) => {
            cachedButtonColors = colors || {};
            colorsLoadedAt = Date.now();
          })
          .catch(() => undefined),
  ]);
  setButtonColors(cachedButtonColors);
}

/* ---------------- state ---------------- */

type State = { k: string; a?: string; b?: string } | null;

async function getState(chatId: number): Promise<State> {
  const raw = await dbGet<any>(`telegramState/${chatId}`);
  if (!raw) return null;
  if (typeof raw === "string") return { k: raw };
  return raw as State;
}
async function setState(chatId: number, s: State) {
  await dbPut(`telegramState/${chatId}`, s);
}

async function isBotAdmin(chatId: number): Promise<boolean> {
  if (ownerIds().includes(chatId)) return true;
  if (await dbGet<boolean>(`telegramAdmins/${chatId}`)) return true;
  // Fresh database: the very first person who opens the bot becomes its owner.
  const existing = await dbGet<any>("telegramAdmins");
  if (!existing || Object.keys(existing).length === 0) {
    const c = await cfg();
    if (!String(c?.telegramOwners ?? "").trim()) {
      await dbPut(`telegramAdmins/${chatId}`, true);
      await dbPut("site_settings/config/telegramOwners", String(chatId));
      return true;
    }
  }
  return false;
}


/** Message ids we should edit instead of sending a new message (per chat). */
const editTarget = new Map<number, number>();

async function say(chatId: number, text: string, keyboard?: any) {
  const messageId = editTarget.get(chatId);
  if (messageId) {
    editTarget.delete(chatId);
    try {
      await tg("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: keyboard ?? { inline_keyboard: [] },
      });
      return;
    } catch {
      /* message too old / identical — fall back to a new message */
    }
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}


const backHome = { inline_keyboard: [[{ text: "⬅️ Menu", callback_data: "home" }]] };

/* ---------------- force join ---------------- */

function channelLink(handle: string) {
  const h = handle.trim();
  if (h.startsWith("http")) return h;
  return `https://t.me/${h.replace(/^@/, "")}`;
}

/** Accepts "@name", "name" or a full https://t.me/name link. */
function channelHandle(raw: string): string {
  const h = raw.trim().replace(/\/+$/, "");
  const m = h.match(/t\.me\/(?:s\/)?([A-Za-z0-9_]{4,})$/i);
  const name = m ? m[1] : h.replace(/^@/, "");
  if (!name || /^\+/.test(name) || /joinchat/i.test(h)) return "";
  return `@${name}`;
}

async function forceJoinBlocked(chatId: number): Promise<boolean> {
  const c = await cfg();
  const ch = (c.forceJoin || "").trim();
  const handle = ch ? channelHandle(ch) : "";
  if (!ch || !handle) return false;
  try {
    const res = await tg("getChatMember", {
      chat_id: handle,
      user_id: chatId,
    });
    const status = res?.result?.status;
    if (["creator", "administrator", "member"].includes(status)) return false;
  } catch {
    return false;
  }

  await say(
    chatId,
    "🔒 <b>Join our channel first</b>\n\nYou must join the channel below to use this bot.",
    {
      inline_keyboard: [
        [{ text: "📢 Join channel", url: channelLink(ch) }],
        [{ text: "✅ I joined", callback_data: "home" }],
      ],
    },
  );
  return true;
}

/* ---------------- user menus ---------------- */

/**
 * Telegram does not let bots pick button colours, so buttons are colour-coded
 * with coloured markers + the admin's chosen emoji for each slot.
 */
const DOT = {
  green: "🟢",
  blue: "🔵",
  violet: "🟣",
  orange: "🟠",
  red: "🔴",
  yellow: "🟡",
} as const;

function cbtn(dot: string, key: string, label: string, data: string) {
  return { text: `${dot} ${be(key)} ${label}`, callback_data: data };
}

function mainKeyboard() {
  return {
    inline_keyboard: [
      [cbtn(DOT.green, "btn.products", "View Products", "products")],
      [
        cbtn(DOT.blue, "btn.wallet", "Wallet", "wallet"),
        cbtn(DOT.violet, "btn.profile", "Profile", "profile"),
      ],
      [
        cbtn(DOT.yellow, "btn.reviews", "Reviews", "reviews"),
        cbtn(DOT.orange, "btn.refer", "Refer & Earn", "refer"),
      ],
      [
        cbtn(DOT.red, "btn.support", "Support", "support"),
        cbtn(DOT.blue, "btn.orders", "Orders", "orders"),
      ],
      [cbtn(DOT.violet, "btn.apikey", "Reseller API key", "apikey")],
      [{ text: `${be("btn.website")} Visit Website`, url: siteUrl() }],
    ],
  };
}

async function welcome(chatId: number) {
  const name = await siteName();
  await say(
    chatId,
    `${em("norm.welcome")} <b>Welcome to ${name} !</b>\n\n` +
      `${em("norm.star")} Premium digital products at the cheapest prices\n` +
      `${em("norm.fast")} Instant delivery\n` +
      `${em("norm.secure")} Secure payments\n` +
      `${em("norm.support")} 24/7 Support\n\n` +
      `Choose an option below:`,
    mainKeyboard(),
  );
  const uid = await ensureUser(chatId);
  if (!(await userEmail(uid))) {
    await askEmail(chatId, "Send your email address so we can mail your orders and delivery details. You can skip and add it later from Profile.");
  }
}

async function linkedUid(chatId: number): Promise<string | null> {
  return await dbGet<string>(`telegramLinks/${chatId}`);
}

/** Every Telegram user gets a store account keyed by their numeric Telegram id. */
async function ensureUser(chatId: number): Promise<string> {
  const existing = await linkedUid(chatId);
  if (existing) return existing;
  const uid = `tg_${chatId}`;
  const current = await dbGet<any>(`users/${uid}`);
  if (!current) {
    await dbPut(`users/${uid}`, {
      name: `Telegram ${chatId}`,
      email: "",
      wallet: 0,
      telegramChatId: chatId,
      myRefCode: `TG${String(chatId).slice(-6)}`,
      source: "telegram",
      joined: new Date().toISOString(),
    });
  } else {
    await dbPatch(`users/${uid}`, { telegramChatId: chatId });
  }
  await dbPut(`telegramLinks/${chatId}`, uid);
  return uid;
}

async function userEmail(uid: string): Promise<string> {
  return String((await dbGet<string>(`users/${uid}/email`)) || "");
}

/** Ask for an email so delivery + order mails can be sent. */
async function askEmail(chatId: number, why?: string) {
  await setState(chatId, { k: "await_email" });
  await say(
    chatId,
    `📧 <b>Add your email</b>\n\n${why || "Send your email address so we can mail your order and delivery details."}`,
    { inline_keyboard: [[{ text: "⏭ Skip for now", callback_data: "home" }]] },
  );
}

async function saveEmail(chatId: number, email: string) {
  const uid = await ensureUser(chatId);
  const users = (await dbGet<Record<string, any>>("users")) || {};
  const hit = Object.entries(users).find(
    ([id, u]: [string, any]) =>
      id !== uid && String(u?.email || "").toLowerCase() === email.toLowerCase(),
  );
  if (hit && !hit[1]?.telegramChatId) {
    // Same email already used on the website — join the two accounts.
    const [target] = hit;
    await dbPut(`telegramLinks/${chatId}`, target);
    await dbPatch(`users/${target}`, { telegramChatId: chatId });
    await setState(chatId, null);
    return say(chatId, "✅ Email saved and your existing store account is now connected here.", mainKeyboard());
  }
  await dbPatch(`users/${uid}`, { email });
  await setState(chatId, null);
  await say(chatId, `✅ Email saved: <code>${email}</code>\nOrder and delivery mails will go there.`, mainKeyboard());
}

async function sendProducts(chatId: number) {
  const all = (await dbGet<Record<string, Product>>("products")) || {};
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

async function sendProduct(chatId: number, id: string) {
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
  const availability =
    p.delivery === "manual" ? "" : `\n${em("norm.fast")} Instant delivery`;
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

async function sendWallet(chatId: number) {
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

async function walletHistory(chatId: number) {
  const uid = await ensureUser(chatId);
  const h = (await dbGet<Record<string, any>>(`users/${uid}/history`)) || {};
  const list = Object.values(h).slice(-10).reverse();
  const text = list.length
    ? list.map((x: any) => `• ${x.type} ${money(x.amount)} — ${x.desc || ""}`).join("\n")
    : "No transactions yet.";
  await say(chatId, `📜 <b>Wallet history</b>\n\n${text}`, backHome);
}

async function startDeposit(chatId: number) {
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

async function startCardDeposit(chatId: number) {
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

async function createCardLink(chatId: number, text: string) {
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
async function checkCardPayment(chatId: number, linkId: string) {
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

async function startWithdraw(chatId: number) {
  const uid = await ensureUser(chatId);
  const wallet = (await dbGet<number>(`users/${uid}/wallet`)) || 0;
  await setState(chatId, { k: "wd_amount" });
  await say(
    chatId,
    `➖ <b>Withdraw</b>\n\nAvailable: <b>${money(wallet)}</b>\nSend the amount you want to withdraw in dollars.`,
    { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "home" }]] },
  );
}

async function sendProfile(chatId: number) {
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

async function sendApiKey(chatId: number, regenerate: boolean) {
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

async function sendOrders(chatId: number) {
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
    inline_keyboard: [
      [{ text: "⬅️ Menu", callback_data: "home" }],
    ],
  });
}

async function sendReviews(chatId: number) {
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

/** Pays the buyer's referrer 2% of the purchase, capped per friend. */
async function payReferralCommission(buyerUid: string, amount: number) {
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
async function applyStartReferral(uid: string, rawCode: string) {
  const code = rawCode.trim().toUpperCase();
  if (!code) return;
  const me = (await dbGet<any>(`users/${uid}`)) || {};
  if (me.refBy || me.usedRef || me.myRefCode === code) return;
  const users = (await dbGet<Record<string, any>>("users")) || {};
  const hit = Object.entries(users).find(
    ([id, u]: [string, any]) => id !== uid && String(u?.myRefCode || "").toUpperCase() === code,
  );
  if (!hit) return;
  await dbPatch(`users/${uid}`, { usedRef: code, refBy: hit[0] });
}

async function sendRefer(chatId: number) {
  const uid = await ensureUser(chatId);
  const u = (await dbGet<any>(`users/${uid}`)) || {};
  const code = u.myRefCode || "-";
  const users = (await dbGet<Record<string, any>>("users")) || {};
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


async function sendSupport(chatId: number) {
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
async function askQty(chatId: number, productId: string, qty = 1) {
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
    {
      inline_keyboard: [...rows, [{ text: "⬅️ Back", callback_data: `p:${productId}` }]],
    },
  );
}

/** Shows how the buyer can pay for the chosen quantity. */
async function askPayMethod(chatId: number, productId: string, qty: number) {
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
async function confirmWalletPay(chatId: number, productId: string, qty: number) {
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

async function buy(chatId: number, productId: string, qty = 1) {
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

/* ---------------- admin panel ---------------- */

async function adminHome(chatId: number) {
  await say(chatId, "👑 <b>Owner panel</b>\n\nManage the whole store from here.", {
    inline_keyboard: [
      [
        { text: "📊 Stats", callback_data: "a:stats" },
        { text: "🧾 Orders", callback_data: "a:orders" },
      ],
      [
        { text: "💰 Requests", callback_data: "a:req" },
        { text: "📦 Products", callback_data: "a:prod" },
      ],
      [
        { text: "👥 Users", callback_data: "a:users" },
        { text: "📣 Broadcast", callback_data: "a:bc" },
      ],
      [
        { text: "🔒 Force join", callback_data: "a:fj" },
        { text: "⭐ Review channel", callback_data: "a:rc" },
      ],
      [
        { text: "⚙️ Settings", callback_data: "a:set" },
        { text: "😍 Emojis", callback_data: "a:em" },
      ],
      [{ text: "🌐 Website admin", url: `${siteUrl()}/admin` }],
    ],
  });
}

const adminBack = { inline_keyboard: [[{ text: "⬅️ Admin", callback_data: "a:home" }]] };

async function adminStats(chatId: number) {
  const [orderMap, userMap, productMap] = await Promise.all([
    dbGet<Record<string, any>>("orders"),
    dbGet<Record<string, any>>("users"),
    dbGet<Record<string, Product>>("products"),
  ]);
  const orders = Object.values(orderMap || {});
  const users = Object.keys(userMap || {}).length;
  const products = Object.values(productMap || {});
  const pending = orders.filter((o: any) => o.status === "Pending").length;
  const revenue = orders
    .filter((o: any) => o.status !== "Cancelled")
    .reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const weekAgo = Date.now() - 7 * 864e5;
  const week = orders
    .filter((o: any) => o.status !== "Cancelled" && new Date(o.date).getTime() > weekAgo)
    .reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const stock = products.reduce(
    (s, p) => s + (Array.isArray(p.stock) ? p.stock.filter(Boolean).length : 0),
    0,
  );
  await say(
    chatId,
    `📊 <b>Stats</b>\n\nOrders: ${orders.length}\nPending: ${pending}\nRevenue: ${money(revenue)}\nThis week: ${money(week)}\nUsers: ${users}\nProducts: ${products.length}\nStock left: ${stock}`,
    adminBack,
  );
}

async function adminOrders(chatId: number) {
  const all = (await dbGet<Record<string, any>>("orders")) || {};
  const pending = Object.values(all)
    .filter((o: any) => o.status === "Pending")
    .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 10);
  if (!pending.length) return say(chatId, "No pending orders 🎉", adminBack);
  await say(chatId, "🧾 <b>Pending orders</b>\nTap one to deliver it.", {
    inline_keyboard: [
      ...pending.map((o: any) => [
        {
          text: `${o.orderId.slice(-6)} • ${money(o.total)} • ${(o.items || [])[0]?.title || ""}`.slice(0, 60),
          callback_data: `a:o:${o.orderId}`,
        },
      ]),
      [{ text: "⬅️ Admin", callback_data: "a:home" }],
    ],
  });
}

async function adminOrder(chatId: number, orderId: string) {
  const o = await dbGet<any>(`orders/${orderId}`);
  if (!o) return say(chatId, "Order not found.", adminBack);
  const items = (o.items || []).map((i: any) => `• ${i.title} x${i.qty || 1}`).join("\n");
  await say(
    chatId,
    `🧾 <b>${o.orderId}</b>\n${items}\nBuyer: ${o.email || o.uid}\nTotal: ${money(o.total)}\nStatus: ${o.status}`,
    {
      inline_keyboard: [
        [{ text: "✅ Complete delivery", callback_data: `a:dl:${orderId}` }],
        [{ text: "❌ Cancel & refund", callback_data: `a:oc:${orderId}` }],
        [{ text: "⬅️ Orders", callback_data: "a:orders" }],
      ],
    },
  );
}

async function adminAskDelivery(chatId: number, orderId: string) {
  await setState(chatId, { k: "deliver", a: orderId });
  await say(
    chatId,
    "✍️ Send the delivery details for this order (the buyer will see exactly this text). One line per item.",
    { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "a:home" }]] },
  );
}

async function adminDeliver(chatId: number, orderId: string, text: string) {
  const o = await dbGet<any>(`orders/${orderId}`);
  if (!o) return say(chatId, "Order not found.", adminBack);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const items = o.items || [];
  const delivered = lines.map((content, idx) => ({
    title: items[idx]?.title || items[0]?.title || "Item",
    content,
  }));
  await dbPatch(`orders/${orderId}`, {
    delivered,
    status: "Completed",
    deliveredAt: new Date().toISOString(),
  });
  await setState(chatId, null);
  await say(chatId, `✅ Order ${orderId} delivered and the buyer was notified.`, adminBack);

  const buyerChat = o.telegramChatId || (o.uid ? await dbGet<number>(`users/${o.uid}/telegramChatId`) : null);
  if (buyerChat) {
    await say(
      Number(buyerChat),
      `✅ <b>Your order is delivered</b>\n\nOrder: <code>${orderId}</code>\n\n${delivered
        .map((d) => `${d.title}\n<code>${d.content}</code>`)
        .join("\n\n")}\n\n🌐 Website: ${siteUrl()}`,
      { inline_keyboard: [[{ text: "🌐 Visit website", url: siteUrl() }]] },
    ).catch(() => undefined);
    await sendDeliveryFiles(Number(buyerChat), orderId, delivered).catch(() => undefined);
  }
}


async function adminCancelOrder(chatId: number, orderId: string) {
  const o = await dbGet<any>(`orders/${orderId}`);
  if (!o) return say(chatId, "Order not found.", adminBack);
  if (o.status !== "Cancelled") {
    await dbPatch(`orders/${orderId}`, { status: "Cancelled" });
    if (o.uid) {
      const w = (await dbGet<number>(`users/${o.uid}/wallet`)) || 0;
      await dbPut(`users/${o.uid}/wallet`, w + Number(o.total || 0));
      await dbPush(`users/${o.uid}/history`, {
        type: "Refund",
        amount: Number(o.total || 0),
        desc: `Cancelled ${orderId.slice(-4)}`,
        date: new Date().toISOString(),
      });
    }
  }
  await say(chatId, `❌ Order ${orderId} cancelled and refunded.`, adminBack);
}

async function adminRequests(chatId: number) {
  const all = (await dbGet<Record<string, any>>("requests")) || {};
  const pending = Object.entries(all)
    .filter(([, r]: [string, any]) => r.status === "Pending")
    .slice(0, 10);
  if (!pending.length) return say(chatId, "No pending wallet requests.", adminBack);
  await say(chatId, "💰 <b>Pending wallet requests</b>", {
    inline_keyboard: [
      ...pending.flatMap(([id, r]: [string, any]) => [
        [{ text: `${r.type} ${money(r.amount)} — ${r.email || r.uid}`.slice(0, 60), callback_data: "noop" }],
        [
          { text: "✅ Approve", callback_data: `a:ra:${id}` },
          { text: "❌ Reject", callback_data: `a:rr:${id}` },
        ],
      ]),
      [{ text: "⬅️ Admin", callback_data: "a:home" }],
    ],
  });
}

async function adminDecideRequest(chatId: number, id: string, approve: boolean) {
  const r = await dbGet<any>(`requests/${id}`);
  if (!r) return say(chatId, "Request not found.", adminBack);
  if (approve) {
    const w = (await dbGet<number>(`users/${r.uid}/wallet`)) || 0;
    const next = r.type === "Deposit" ? w + Number(r.amount) : w - Number(r.amount);
    if (next < 0) return say(chatId, "User has insufficient balance.", adminBack);
    await dbPut(`users/${r.uid}/wallet`, next);
    await dbPush(`users/${r.uid}/history`, {
      type: r.type,
      amount: r.amount,
      desc: `${r.type} approved`,
      date: new Date().toISOString(),
    });
  }
  await dbPatch(`requests/${id}`, { status: approve ? "Approved" : "Rejected" });
  const buyerChat = await dbGet<number>(`users/${r.uid}/telegramChatId`);
  if (buyerChat)
    await say(
      Number(buyerChat),
      `${approve ? "✅" : "❌"} Your ${r.type.toLowerCase()} of ${money(r.amount)} was ${approve ? "approved" : "rejected"}.`,
    ).catch(() => undefined);
  await say(chatId, `Request ${approve ? "approved" : "rejected"}.`, adminBack);
}

async function adminProducts(chatId: number) {
  const all = (await dbGet<Record<string, Product>>("products")) || {};
  const list = Object.entries(all).slice(0, 30);
  const newBtn = [{ text: "➕ New product", callback_data: "a:pnew" }];
  if (!list.length)
    return say(chatId, "📦 No products yet. Add your first one.", {
      inline_keyboard: [newBtn, [{ text: "⬅️ Admin", callback_data: "a:home" }]],
    });
  await say(chatId, "📦 <b>Products</b>\nTap one to manage.", {
    inline_keyboard: [
      ...list.map(([id, p]) => [
        {
          text: `${p.title || "Item"} • ${money(p.price || 0)} • stock ${Array.isArray(p.stock) ? p.stock.filter(Boolean).length : 0}`.slice(0, 60),
          callback_data: `a:p:${id}`,
        },
      ]),
      newBtn,
      [{ text: "⬅️ Admin", callback_data: "a:home" }],
    ],
  });
}

async function adminProduct(chatId: number, id: string) {
  const p = await dbGet<Product>(`products/${id}`);
  if (!p) return say(chatId, "Product not found.", adminBack);
  const stock = Array.isArray(p.stock) ? p.stock.filter(Boolean).length : 0;
  await say(
    chatId,
    `📦 <b>${p.title}</b>\n${p.desc ? `${p.desc}\n` : ""}Price: ${money(p.price || 0)}\nDelivery: ${p.delivery || "manual"}\nStock: ${stock}\nSales: ${p.salesCount || 0}`,
    {
      inline_keyboard: [
        [
          { text: "💵 Change price", callback_data: `a:pp:${id}` },
          { text: "➕ Add stock", callback_data: `a:ps:${id}` },
        ],
        [
          { text: "✏️ Title", callback_data: `a:pt:${id}` },
          { text: "📝 Description", callback_data: `a:pdsc:${id}` },
        ],
        [
          { text: "⚡ Auto", callback_data: `a:pd:${id}:auto` },
          { text: "🔁 Repeat", callback_data: `a:pd:${id}:repeat` },
          { text: "🕐 Manual", callback_data: `a:pd:${id}:manual` },
        ],
        [
          { text: "🧹 Clear stock", callback_data: `a:psc:${id}` },
          { text: "🗑 Delete", callback_data: `a:pdel:${id}` },
        ],
        [{ text: "⬅️ Products", callback_data: "a:prod" }],
      ],
    },
  );
}


async function adminUsers(chatId: number) {
  await setState(chatId, { k: "u_find" });
  await say(chatId, "👥 Send an email (or part of it) to find a user.", {
    inline_keyboard: [[{ text: "❌ Cancel", callback_data: "a:home" }]],
  });
}

async function adminFindUser(chatId: number, q: string) {
  const users = (await dbGet<Record<string, any>>("users")) || {};
  const hits = Object.entries(users)
    .filter(([, u]: [string, any]) => String(u?.email || "").toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);
  await setState(chatId, null);
  if (!hits.length) return say(chatId, "No user found.", adminBack);
  await say(chatId, "👥 <b>Results</b>", {
    inline_keyboard: [
      ...hits.map(([uid, u]: [string, any]) => [
        { text: `${u.email} • ${money(u.wallet || 0)}`.slice(0, 60), callback_data: `a:u:${uid}` },
      ]),
      [{ text: "⬅️ Admin", callback_data: "a:home" }],
    ],
  });
}

async function adminUser(chatId: number, uid: string) {
  const u = (await dbGet<any>(`users/${uid}`)) || {};
  await say(
    chatId,
    `👤 <b>${u.email || uid}</b>\nName: ${u.name || "-"}\nWallet: ${money(u.wallet || 0)}\nAdmin: ${u.isAdmin ? "yes" : "no"}`,
    {
      inline_keyboard: [
        [{ text: "💵 Set wallet balance", callback_data: `a:uw:${uid}` }],
        [
          { text: u.isAdmin ? "🚫 Remove admin" : "🛠 Make admin", callback_data: `a:ua:${uid}` },
        ],
        [{ text: "⬅️ Admin", callback_data: "a:home" }],
      ],
    },
  );
}

async function saveConfig(patch: Record<string, unknown>) {
  await dbPatch(CFG, patch);
}

async function adminSettings(chatId: number) {
  const c = await cfg();
  await say(
    chatId,
    `⚙️ <b>Settings</b>\n\nSite name: ${c.siteName || "-"}\nSupport: ${c.supportLink || "-"}\nDeposit address: <code>${c.depositAddress || "-"}</code>`,
    {
      inline_keyboard: [
        [{ text: "✏️ Site name", callback_data: "a:s:siteName" }],
        [{ text: "✏️ Support link", callback_data: "a:s:supportLink" }],
        [{ text: "✏️ Deposit address", callback_data: "a:s:depositAddress" }],
        [{ text: "⬅️ Admin", callback_data: "a:home" }],
      ],
    },
  );
}

/* ---------------- emoji setup (/setemoji) ---------------- */

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

async function emojiHome(chatId: number, note = "") {
  const all = (await dbGet<Record<string, Product>>("products")) || {};
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

async function emojiAsk(chatId: number) {
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
async function emojiGroup(chatId: number, group: string, page = 0) {
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
        ...slice.map(([key, v]) => [
          { text: `${be(key)} ${v.label}`, callback_data: `a:emk:${key}` },
        ]),
        ...emPager(`a:emg:${group}:`, page, slots.length),
        [{ text: "⬅️ Emojis", callback_data: "a:em" }],
      ],
    },
  );
}

/** Admin picked a ready-made slot — jump straight to "send the new emoji". */
async function emojiSlotPick(chatId: number, slotKey: string) {
  const slot = EMOJI_SLOTS[slotKey];
  if (!slot) return emojiHome(chatId);
  await setState(chatId, { k: "em_to", a: slot.char });
  return say(
    chatId,
    `Send the new emoji for <b>${slot.label}</b> (now ${be(slotKey)}).\nPremium (custom) emojis work too.`,
    {
      inline_keyboard: [[{ text: "❌ Cancel", callback_data: `a:emg:${slot.group}:0` }]],
    },
  );
}

async function emojiList(chatId: number, page = 0) {
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
          text: `${r.from} ➜ ${r.char}${r.id ? " ✨" : ""}`,
          callback_data: `a:emd:${emojiKey(r.from)}`,
        },
      ]),
      ...emPager("a:emL:", page, rules.length),
      [{ text: "⬅️ Emojis", callback_data: "a:em" }],
    ],
  });
}

async function emojiProducts(chatId: number, page = 0) {
  const all = (await dbGet<Record<string, Product>>("products")) || {};
  const entries = Object.entries(all);
  if (!entries.length)
    return say(chatId, "No products yet.", { inline_keyboard: [[{ text: "⬅️ Emojis", callback_data: "a:em" }]] });
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
async function emojiFromMessage(chatId: number, text: string, entities?: any[], sticker?: any) {
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
async function emojiToMessage(
  chatId: number,
  from: string,
  text: string,
  entities?: any[],
  sticker?: any,
) {
  const value = readEmoji(text, entities, sticker);
  if (!value) return say(chatId, "Please send one emoji.");
  try {
    await setRule(from, value);
  } catch (error) {
    console.error("emoji save failed", error);
    return say(chatId, "❌ That emoji could not be saved. Please try again.");
  }
  await setState(chatId, null);
  let note = "";
  if (value.id) {
    const img = await fetchEmojiImage(value.id);
    if (img) await saveRuleImage(from, img);
    else note = "\n⚠️ The website could not download this premium emoji's picture.";
  }
  await say(chatId, `✅ Saved: ${from} ➜ ${value.char}${value.id ? " (premium ✨)" : ""}${note}`);
  return emojiHome(chatId);
}

/** Product emoji step. */
async function emojiProductMessage(
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



async function broadcast(chatId: number, text: string) {
  const users = (await dbGet<Record<string, boolean>>("telegramUsers")) || {};
  const ids = Object.keys(users).map(Number).filter(Boolean);
  let sent = 0;
  for (const id of ids) {
    try {
      await tg("sendMessage", { chat_id: id, text, parse_mode: "HTML" });
      sent++;
    } catch {
      /* blocked user */
    }
  }
  await setState(chatId, null);
  await say(chatId, `📣 Broadcast sent to ${sent}/${ids.length} users.`, adminBack);
}

/* ---------------- routing ---------------- */

async function handleCallback(chatId: number, data: string) {
  if (data === "noop") return;
  if (data === "home") {
    await setState(chatId, null);
    if (await forceJoinBlocked(chatId)) return;
    return welcome(chatId);
  }
  if (await forceJoinBlocked(chatId)) return;

  if (data.startsWith("a:")) {
    if (!(await isBotAdmin(chatId))) return;
    const [, key, arg, arg2] = data.split(":");
    if (key === "home") return adminHome(chatId);
    if (key === "stats") return adminStats(chatId);
    if (key === "orders") return adminOrders(chatId);
    if (key === "o") return adminOrder(chatId, arg!);
    if (key === "dl") return adminAskDelivery(chatId, arg!);
    if (key === "oc") return adminCancelOrder(chatId, arg!);
    if (key === "req") return adminRequests(chatId);
    if (key === "ra") return adminDecideRequest(chatId, arg!, true);
    if (key === "rr") return adminDecideRequest(chatId, arg!, false);
    if (key === "prod") return adminProducts(chatId);
    if (key === "p") return adminProduct(chatId, arg!);
    if (key === "pp") {
      await setState(chatId, { k: "p_price", a: arg! });
      return say(chatId, "Send the new price in dollars (e.g. 9.99).");
    }
    if (key === "ps") {
      await setState(chatId, { k: "p_stock", a: arg! });
      return say(chatId, "Send the stock lines — one line = one stock item.");
    }
    if (key === "pd") {
      await dbPatch(`products/${arg}`, { delivery: arg2 });
      return adminProduct(chatId, arg!);
    }
    if (key === "pnew") {
      await setState(chatId, { k: "p_new" });
      return say(
        chatId,
        "🆕 <b>New product</b>\n\nSend it as:\n<code>Title | price | description</code>\n\nExample:\n<code>Netflix 1 Month | 3.5 | Private profile, 30 days warranty</code>",
        { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "a:prod" }]] },
      );
    }
    if (key === "pt") {
      await setState(chatId, { k: "p_title", a: arg! });
      return say(chatId, "Send the new product title.");
    }
    if (key === "pdsc") {
      await setState(chatId, { k: "p_desc", a: arg! });
      return say(chatId, "Send the new product description.");
    }
    if (key === "psc") {
      await dbPut(`products/${arg}/stock`, []);
      return adminProduct(chatId, arg!);
    }
    if (key === "pdel") {
      await dbPut(`products/${arg}`, null);
      await say(chatId, "🗑 Product deleted.");
      return adminProducts(chatId);
    }
    if (key === "users") return adminUsers(chatId);
    if (key === "u") return adminUser(chatId, arg!);
    if (key === "uw") {
      await setState(chatId, { k: "u_wallet", a: arg! });
      return say(chatId, "Send the new wallet balance in dollars.");
    }
    if (key === "ua") {
      const cur = await dbGet<boolean>(`users/${arg}/isAdmin`);
      await dbPatch(`users/${arg}`, { isAdmin: !cur });
      return adminUser(chatId, arg!);
    }
    if (key === "bc") {
      await setState(chatId, { k: "bc" });
      return say(chatId, "📣 Send the message to broadcast to every bot user.", {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "a:home" }]],
      });
    }
    if (key === "fj") {
      const c = await cfg();
      return say(chatId, `🔒 <b>Force join</b>\n\nCurrent: ${c.forceJoin || "off"}`, {
        inline_keyboard: [
          [{ text: "✏️ Set channel", callback_data: "a:s:forceJoin" }],
          [{ text: "🚫 Turn off", callback_data: "a:fjoff" }],
          [{ text: "⬅️ Admin", callback_data: "a:home" }],
        ],
      });
    }
    if (key === "fjoff") {
      await saveConfig({ forceJoin: "" });
      return say(chatId, "Force join turned off.", adminBack);
    }
    if (key === "rc") {
      const c = await cfg();
      return say(chatId, `⭐ <b>Review channel</b>\n\nCurrent: ${c.reviewChannel || "not set"}`, {
        inline_keyboard: [
          [{ text: "✏️ Set channel", callback_data: "a:s:reviewChannel" }],
          [{ text: "⬅️ Admin", callback_data: "a:home" }],
        ],
      });
    }
    if (key === "set") return adminSettings(chatId);
    if (key === "em") {
      if (arg === "add") return emojiAsk(chatId);
      if (arg === "list") return emojiList(chatId);
      if (arg === "prod") return emojiProducts(chatId);
      if (arg === "sync") {
        const fixed = await syncEmojiImages().catch(() => 0);
        return emojiHome(chatId, `🔄 ${fixed} emoji picture(s) synced for the website.`);
      }
      if (arg === "rst")
        return say(chatId, "♻️ Remove every emoji you set (bot + website + products)?", {
          inline_keyboard: [
            [{ text: "✅ Yes, reset all", callback_data: "a:em:rst2" }],
            [{ text: "❌ Cancel", callback_data: "a:em" }],
          ],
        });
      if (arg === "rst2") {
        await resetAllEmojis();
        return emojiHome(chatId, "♻️ All emojis are back to the defaults.");
      }
      return emojiHome(chatId);
    }
    if (key === "emL") return emojiList(chatId, Number(arg) || 0);
    if (key === "emP") return emojiProducts(chatId, Number(arg) || 0);
    if (key === "emg") return emojiGroup(chatId, String(arg), Number(arg2) || 0);
    if (key === "emk") return emojiSlotPick(chatId, data.slice("a:emk:".length));
    if (key === "emd") {
      await removeRule(String(arg));
      await say(chatId, "🗑 Removed.");
      return emojiList(chatId);
    }
    if (key === "emp") {
      await setState(chatId, { k: "em_prod", a: arg! });
      return say(chatId, "Send the emoji for this product (premium emoji supported).", {
        inline_keyboard: [
          [{ text: "♻️ Use default 🛍", callback_data: `a:emx:${arg}` }],
          [{ text: "❌ Cancel", callback_data: "a:em:prod" }],
        ],
      });
    }
    if (key === "emx") {
      const id = data.slice("a:emx:".length);
      await setState(chatId, null);
      await clearProductEmoji(id);
      await say(chatId, "♻️ Product emoji reset to the default.");
      return emojiProducts(chatId);
    }

    if (key === "s") {
      await setState(chatId, { k: "cfg", a: arg! });
      return say(chatId, `Send the new value for <b>${arg}</b>.`, {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "a:home" }]],
      });
    }
    return;
  }

  if (data === "products") return sendProducts(chatId);
  if (data === "wallet") return sendWallet(chatId);
  if (data === "whist") return walletHistory(chatId);
  if (data === "dep") return startDeposit(chatId);
  if (data === "depcard") return startCardDeposit(chatId);
  if (data === "wd") return startWithdraw(chatId);
  if (data === "profile") return sendProfile(chatId);
  if (data === "apikey") return sendApiKey(chatId, false);
  if (data === "apikey_new") return sendApiKey(chatId, true);
  if (data === "orders") return sendOrders(chatId);
  if (data === "reviews") return sendReviews(chatId);
  if (data === "rev_new") {
    await setState(chatId, { k: "review" });
    return say(chatId, "✍️ Send your review (start with a number 1-5 for the rating, e.g. “5 great service”).");
  }
  if (data === "refer") return sendRefer(chatId);
  if (data === "support") return sendSupport(chatId);
  if (data === "link" || data === "setmail") return askEmail(chatId);
  if (data.startsWith("p:")) return sendProduct(chatId, data.slice(2));
  if (data.startsWith("bqc:")) {
    const pid = data.slice(4);
    await setState(chatId, { k: "buy_qty", a: pid });
    return say(chatId, "✏️ Send the number of items you want (1–20).", {
      inline_keyboard: [[{ text: "⬅️ Back", callback_data: `b:${pid}` }]],
    });
  }
  if (data.startsWith("bq:")) {
    const [, pid, n] = data.split(":");
    return askQty(chatId, String(pid), Number(n) || 1);
  }
  if (data.startsWith("bpm:")) {
    const [, pid, n] = data.split(":");
    return askPayMethod(chatId, String(pid), Number(n) || 1);
  }
  if (data.startsWith("bcf:")) {
    const [, pid, n] = data.split(":");
    return confirmWalletPay(chatId, String(pid), Number(n) || 1);
  }
  if (data.startsWith("bgo:")) {
    const [, pid, n] = data.split(":");
    return buy(chatId, String(pid), Number(n) || 1);
  }
  if (data.startsWith("pchk:")) return checkCardPayment(chatId, data.slice(5));
  if (data.startsWith("b:")) return askQty(chatId, data.slice(2));
}

async function submitReview(chatId: number, text: string) {
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

async function handleText(chatId: number, text: string, entities?: any[], sticker?: any) {
  const t = text.trim();
  await dbPut(`telegramUsers/${chatId}`, true);

  if (t === "/start" || t === "/menu" || t.startsWith("/start ")) {
    await setState(chatId, null);
    if (await forceJoinBlocked(chatId)) return;
    if (t.startsWith("/start ")) {
      const uid = await ensureUser(chatId);
      await applyStartReferral(uid, t.slice(7));
    }
    return welcome(chatId);
  }
  if (await forceJoinBlocked(chatId)) return;
  if (t === "/link" || t === "/email") return askEmail(chatId);
  if (t === "/admin") {
    if (!(await isBotAdmin(chatId))) return say(chatId, "This command is for store owners only.");
    await setState(chatId, null);
    return adminHome(chatId);
  }
  if (t === "/setemoji") {
    if (!(await isBotAdmin(chatId))) return say(chatId, "This command is for store owners only.");
    await setState(chatId, null);
    return emojiHome(chatId);
  }

  const state = await getState(chatId);
  const k = state?.k;

  if (k === "await_email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return say(chatId, "That does not look like an email. Send it like name@mail.com");
    return saveEmail(chatId, t);
  }

  if (k === "buy_qty") {
    const n = Math.floor(Number(t.trim()));
    if (!Number.isFinite(n) || n < 1 || n > 20)
      return say(chatId, "Please send a number between 1 and 20.");
    await setState(chatId, null);
    return askQty(chatId, String(state?.a || ""), n);
  }

  if (k === "dep_card") return createCardLink(chatId, t);

  if (k === "dep_hash") {
    const hash = t.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return say(chatId, "Send the full transaction hash, starting with 0x.");
    const uid = await ensureUser(chatId);
    const u = await dbGet<any>(`users/${uid}`);
    const c = await cfg();
    const address = c.depositAddress || defaultDepositAddress();
    if (!address) return say(chatId, "No deposit wallet is set up yet. Ask the store owner to add one in the admin panel.", backHome);

    const already = await dbGet<any>(`deposits/${hash}`);
    if (already) return say(chatId, "This transaction has already been used.", backHome);

    await say(chatId, "🔎 Checking the blockchain…");
    let res;
    try {
      res = await verifyDepositAnyChain(hash, address);
    } catch {
      return say(chatId, "Could not read that transaction right now. Try again in a minute.", backHome);
    }
    if (!res.ok) return say(chatId, `❌ ${res.message}`, backHome);

    await setState(chatId, null);
    const base = {
      uid,
      name: u?.name || "",
      email: u?.email || "",
      amount: res.amount,
      symbol: res.symbol,
      chain: res.chain,
      txHash: hash,
      source: "telegram",
      date: new Date().toISOString(),
    };

    if (res.status === "credited") {
      await dbPut(`deposits/${hash}`, { ...base, status: "Credited" });
      const w = (await dbGet<number>(`users/${uid}/wallet`)) || 0;
      await dbPut(`users/${uid}/wallet`, Number(w) + res.amount);
      await dbPush(`users/${uid}/history`, {
        type: "Deposit",
        amount: res.amount,
        desc: `${res.symbol} on ${res.chain}`,
        date: base.date,
      });
      await say(
        chatId,
        `✅ <b>Deposit done</b>\n${money(res.amount)} ${res.symbol} on ${res.chain} credited.\nNew balance: <b>${money(Number(w) + res.amount)}</b>`,
        backHome,
      );
      return notifyOwners(
        `💰 <b>Telegram deposit credited</b>\n${u?.email || chatId}\nAmount: ${money(res.amount)}\nTX: <code>${hash}</code>`,
      );
    }

    await dbPut(`deposits/${hash}`, { ...base, status: "Pending" });
    await dbPush("requests", { ...base, type: "Deposit", utr: hash, status: "Pending" });
    await say(chatId, `⏳ ${res.message}`, backHome);
    return notifyOwners(
      `💰 <b>Telegram deposit for review</b>\n${u?.email || chatId}\nAmount: ${money(res.amount)}\nAge: ${res.ageMinutes} min\nTX: <code>${hash}</code>`,
    );
  }
  if (k === "wd_amount") {
    const uid = await ensureUser(chatId);
    const wallet = (await dbGet<number>(`users/${uid}/wallet`)) || 0;
    const amt = Number(t);
    if (!amt || amt <= 0) return say(chatId, "Send a valid amount.");
    if (amt > wallet) return say(chatId, `You only have ${money(wallet)}.`);
    await setState(chatId, { k: "wd_addr", a: String(amt) });
    return say(chatId, "Send the wallet address (USDT BEP20 / Polygon) to receive the payout.");
  }
  if (k === "wd_addr") {
    const uid = await ensureUser(chatId);
    const u = await dbGet<any>(`users/${uid}`);
    await dbPush("requests", {
      uid,
      name: u?.name || "",
      email: u?.email || "",
      type: "Withdraw",
      amount: Number(state?.a || 0),
      upi: t,
      status: "Pending",
      source: "telegram",
      date: new Date().toISOString(),
    });
    await setState(chatId, null);
    await say(chatId, "✅ Withdrawal requested. We will process it shortly.", backHome);
    return notifyOwners(`🏧 <b>Telegram withdrawal</b>\n${u?.email || chatId}\nAmount: ${money(Number(state?.a || 0))}\nTo: <code>${t}</code>`);
  }
  if (k === "review") return submitReview(chatId, t);

  if (state && (await isBotAdmin(chatId))) {
    if (k === "em_from") return emojiFromMessage(chatId, text, entities, sticker);
    if (k === "em_to") return emojiToMessage(chatId, state.a!, text, entities, sticker);
    if (k === "em_prod") return emojiProductMessage(chatId, state.a!, text, entities, sticker);
    if (k === "deliver") return adminDeliver(chatId, state.a!, t);
    if (k === "bc") return broadcast(chatId, t);
    if (k === "cfg") {
      await saveConfig({ [state.a!]: t });
      await setState(chatId, null);
      return say(chatId, "✅ Saved.", adminBack);
    }
    if (k === "p_price") {
      await dbPatch(`products/${state.a}`, { price: Number(t) || 0 });
      await setState(chatId, null);
      return adminProduct(chatId, state.a!);
    }
    if (k === "p_stock") {
      const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
      const cur = (await dbGet<string[]>(`products/${state.a}/stock`)) || [];
      await dbPut(`products/${state.a}/stock`, [...cur.filter(Boolean), ...lines]);
      await setState(chatId, null);
      await say(chatId, `✅ Added ${lines.length} stock items.`);
      return adminProduct(chatId, state.a!);
    }
    if (k === "p_new") {
      const [rawTitle = "", rawPrice = "", ...rest] = t.split("|");
      const title = rawTitle.trim();
      const price = Number(String(rawPrice).replace(/[^0-9.]/g, "")) || 0;
      if (!title || !price)
        return say(chatId, "❌ Send it as: <code>Title | price | description</code>");
      const id = `p${Date.now().toString(36)}`;
      await dbPut(`products/${id}`, {
        id,
        title,
        price,
        desc: rest.join("|").trim(),
        delivery: "manual",
        stock: [],
        salesCount: 0,
      });
      await setState(chatId, null);
      await say(chatId, `✅ Product created: <b>${title}</b> — ${money(price)}`);
      return adminProduct(chatId, id);
    }
    if (k === "p_title") {
      await dbPatch(`products/${state.a}`, { title: t.trim() });
      await setState(chatId, null);
      return adminProduct(chatId, state.a!);
    }
    if (k === "p_desc") {
      await dbPatch(`products/${state.a}`, { desc: t.trim() });
      await setState(chatId, null);
      return adminProduct(chatId, state.a!);
    }
    if (k === "u_find") return adminFindUser(chatId, t);
    if (k === "u_wallet") {
      await dbPut(`users/${state.a}/wallet`, Number(t) || 0);
      await setState(chatId, null);
      return adminUser(chatId, state.a!);
    }
  }

  return welcome(chatId);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Settings, styling and the update body load together instead of one by one.
        const [, , update] = await Promise.all([
          loadBotRuntime().catch(() => undefined),
          loadBotPresentation().catch(() => undefined),
          request.json().catch(() => null),
        ]);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!telegramWebhookOk(actual)) return new Response("Unauthorized", { status: 401 });

        try {
          if (update?.callback_query) {
            const cq = update.callback_query;
            // Stop the button spinner right away; don't wait for Telegram.
            void tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => undefined);
            const chatId = cq.message?.chat?.id;
            const messageId = cq.message?.message_id;
            if (chatId && messageId) editTarget.set(Number(chatId), Number(messageId));
            if (chatId) {
              try {
                await handleCallback(Number(chatId), String(cq.data || ""));
              } finally {
                editTarget.delete(Number(chatId));
              }
            }

          } else {
            const msg = update?.message ?? update?.edited_message;
            const chatId = msg?.chat?.id;
            if (chatId)
              await handleText(
                Number(chatId),
                String(msg.text ?? msg.caption ?? ""),
                msg.entities ?? msg.caption_entities,
                msg.sticker,
              );
          }
        } catch (err) {
          console.error("telegram webhook error", err);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
