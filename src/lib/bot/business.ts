/**
 * Telegram Business chat automation: the owner adds this bot to their personal
 * Telegram Business account ("Chat Automation"), and it answers the people who
 * write to them — in the owner's own chat, under the owner's name.
 *
 * The owner stays in control: whenever they type a reply themselves, the bot
 * goes quiet for that chat, and it learns from what the owner wrote.
 */
import { dbGet, dbPush, dbPut, tg } from "@/lib/telegram.server";
import { ensureUser } from "./core";
import { buildSupportReply } from "./support";

const OWNER_ONLINE_MS = 5 * 60_000;
const WAIT_FOR_OWNER_MS = 5_000;

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** The bot's own @username, read once and kept in memory. */
let botUsername = "";
async function getBotUsername(): Promise<string> {
  if (botUsername) return botUsername;
  try {
    const me = await tg("getMe", {});
    botUsername = String(me?.result?.username || "").toLowerCase();
  } catch {
    botUsername = "";
  }
  return botUsername;
}

/** True when the message tags the bot (@name) or replies to one of its messages. */
async function taggedBot(msg: any): Promise<boolean> {
  const name = await getBotUsername();
  if (!name) return false;
  const text = String(msg?.text ?? msg?.caption ?? "");
  if (new RegExp(`@${name}\\b`, "i").test(text)) return true;
  const ents = [...(msg?.entities ?? []), ...(msg?.caption_entities ?? [])];
  for (const e of ents) {
    if (e?.type === "mention") {
      const at = text.substr(e.offset, e.length).toLowerCase();
      if (at === `@${name}`) return true;
    }
  }
  return false;
}


/** The owner connected / changed / removed the bot in their Business settings. */
export async function handleBusinessConnection(conn: any) {
  const id = String(conn?.id || "");
  if (!id) return;
  await dbPut(`business/connections/${id}`, {
    ownerId: Number(conn?.user?.id || 0),
    ownerChatId: Number(conn?.user_chat_id || 0),
    enabled: conn?.is_enabled !== false,
    canReply: conn?.rights?.can_reply ?? conn?.can_reply ?? true,
    date: new Date().toISOString(),
  });
}

/** Any message inside a chat the owner manages with Business mode. */
export async function handleBusinessMessage(msg: any) {
  const connId = String(msg?.business_connection_id || "");
  const chatId = Number(msg?.chat?.id || 0);
  const fromId = Number(msg?.from?.id || 0);
  const text = String(msg?.text ?? msg?.caption ?? "").trim();
  if (!connId || !chatId || !text) return;

  const conn = (await dbGet<any>(`business/connections/${connId}`)) || {};
  if (conn.enabled === false) return;
  const ownerId = Number(conn.ownerId || 0);

  // The customer's chat id is the chat itself; the owner's own outgoing
  // messages arrive here too, and those are the tone we learn from.
  const customerChatId = fromId === ownerId ? chatId : fromId || chatId;
  const uid = await ensureUser(customerChatId);
  const at = Date.now();

  const tagged = await taggedBot(msg);
  const question = tagged
    ? text.replace(new RegExp(`@${botUsername}`, "ig"), "").trim() || text
    : text;

  if (fromId === ownerId) {
    // The owner tagged the bot in their own chat — answer right away.
    if (tagged) {
      const ownerReply = await buildSupportReply(customerChatId, uid, question);
      if (ownerReply)
        await tg("sendMessage", {
          business_connection_id: connId,
          chat_id: chatId,
          text: esc(ownerReply),
          parse_mode: "HTML",
        }).catch(() => undefined);
      return;
    }
    await Promise.all([
      dbPush(`support/${uid}/messages`, { from: "owner", text, date: new Date().toISOString() }),
      dbPut(`support/${uid}/lastOwnerAt`, at),
    ]);
    return;
  }

  await Promise.all([
    dbPush(`support/${uid}/messages`, { from: "user", text, date: new Date().toISOString() }),
    dbPut(`support/${uid}/businessChatId`, chatId),
    dbPut(`support/${uid}/lastUserAt`, at),
  ]);

  // Tagged directly → answer instantly, whether or not the owner is around.
  if (!tagged) {
    // The owner answered this person moments ago — they are online, stay quiet.
    const lastOwnerAt = Number((await dbGet<number>(`support/${uid}/lastOwnerAt`)) || 0);
    if (at - lastOwnerAt < OWNER_ONLINE_MS) return;

    await new Promise((r) => setTimeout(r, WAIT_FOR_OWNER_MS));
    if (Number((await dbGet<number>(`support/${uid}/lastOwnerAt`)) || 0) >= at) return;
  }

  const reply = await buildSupportReply(customerChatId, uid, question);
  if (!reply) return;


  await dbPush(`support/${uid}/messages`, {
    from: "bot",
    text: reply,
    date: new Date().toISOString(),
  });
  await tg("sendMessage", {
    business_connection_id: connId,
    chat_id: chatId,
    text: esc(reply),
    parse_mode: "HTML",
  }).catch(() => undefined);
}
