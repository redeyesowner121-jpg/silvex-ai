import { createFileRoute } from "@tanstack/react-router";
import { defaultDepositAddress, verifyDepositAnyChain } from "@/lib/deposit.server";
import {
  dbGet,
  dbPatch,
  dbPush,
  dbPut,
  money,
  notifyOwners,
  telegramWebhookOk,
  loadBotRuntime,
  tg,
} from "@/lib/telegram.server";
import { resetAllEmojis, syncEmojiImages } from "@/lib/emoji.server";
import {
  adminBack,
  askEmail,
  backHome,
  cfg,
  editTarget,
  ensureUser,
  forceJoinBlocked,
  getState,
  invalidateProducts,
  isBotAdmin,
  loadBotPresentation,
  say,
  saveConfig,
  saveEmail,
  setState,
  welcome,
} from "@/lib/bot/core";
import {
  applyStartReferral,
  askPayMethod,
  askQty,
  buy,
  checkCardPayment,
  confirmWalletPay,
  createCardLink,
  sendApiKey,
  sendOrders,
  sendProduct,
  sendProducts,
  sendProfile,
  sendRefer,
  sendReviews,
  sendSupport,
  sendWallet,
  startCardDeposit,
  startDeposit,
  startWithdraw,
  submitReview,
  walletHistory,
} from "@/lib/bot/shop";
import {
  adminAskDelivery,
  adminCancelOrder,
  adminDecideRequest,
  adminDeliver,
  adminFindUser,
  adminHome,
  adminOrder,
  adminOrders,
  adminProduct,
  adminProducts,
  adminRequests,
  adminSettings,
  adminStats,
  adminUser,
  adminUsers,
  broadcast,
} from "@/lib/bot/admin";
import {
  clearProductEmoji,
  emojiAsk,
  emojiFromMessage,
  emojiGroup,
  emojiHome,
  emojiList,
  emojiProductMessage,
  emojiProducts,
  emojiSlotPick,
  emojiToMessage,
  removeRule,
} from "@/lib/bot/emoji-ui";

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
      invalidateProducts();
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
      invalidateProducts();
      return adminProduct(chatId, arg!);
    }
    if (key === "pdel") {
      await dbPut(`products/${arg}`, null);
      invalidateProducts();
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

async function handleText(chatId: number, text: string, entities?: any[], sticker?: any) {
  const t = text.trim();
  void dbPut(`telegramUsers/${chatId}`, true).catch(() => undefined);

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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t))
      return say(chatId, "That does not look like an email. Send it like name@mail.com");
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
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash))
      return say(chatId, "Send the full transaction hash, starting with 0x.");
    const uid = await ensureUser(chatId);
    const u = await dbGet<any>(`users/${uid}`);
    const c = await cfg();
    const address = c.depositAddress || defaultDepositAddress();
    if (!address)
      return say(
        chatId,
        "No deposit wallet is set up yet. Ask the store owner to add one in the admin panel.",
        backHome,
      );

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
    return notifyOwners(
      `🏧 <b>Telegram withdrawal</b>\n${u?.email || chatId}\nAmount: ${money(Number(state?.a || 0))}\nTo: <code>${t}</code>`,
    );
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
      invalidateProducts();
      await setState(chatId, null);
      return adminProduct(chatId, state.a!);
    }
    if (k === "p_stock") {
      const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
      const cur = (await dbGet<string[]>(`products/${state.a}/stock`)) || [];
      await dbPut(`products/${state.a}/stock`, [...cur.filter(Boolean), ...lines]);
      invalidateProducts();
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
      invalidateProducts();
      await setState(chatId, null);
      await say(chatId, `✅ Product created: <b>${title}</b> — ${money(price)}`);
      return adminProduct(chatId, id);
    }
    if (k === "p_title") {
      await dbPatch(`products/${state.a}`, { title: t.trim() });
      invalidateProducts();
      await setState(chatId, null);
      return adminProduct(chatId, state.a!);
    }
    if (k === "p_desc") {
      await dbPatch(`products/${state.a}`, { desc: t.trim() });
      invalidateProducts();
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
