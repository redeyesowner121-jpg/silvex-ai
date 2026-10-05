/**
 * Reliable Telegram broadcast: collects every known bot user, sends in paced
 * waves under Telegram's ~30 msg/s limit, retries rate-limited/network
 * failures until done, and keeps a live progress log in the admin chat(s).
 */
import { dbGet, ownerIds, tg } from "./telegram.server";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const WAVE = 25; // messages per wave
const WAVE_MS = 1100; // spacing between waves (stays under 30/s)
const MAX_ROUNDS = 6; // retry rounds for transient failures

/** Every Telegram chat that has ever used the bot or linked an account. */
export async function allBotUserIds(): Promise<number[]> {
  const [tu, users] = await Promise.all([
    dbGet<Record<string, unknown>>("telegramUsers").catch(() => null),
    dbGet<Record<string, { telegramChatId?: number | string }>>("users").catch(() => null),
  ]);
  const set = new Set<number>();
  for (const k of Object.keys(tu || {})) {
    const n = Number(k);
    if (n) set.add(n);
  }
  for (const u of Object.values(users || {})) {
    const n = Number(u?.telegramChatId);
    if (n) set.add(n);
  }
  return [...set];
}

function retryAfterMs(e: unknown): number {
  const m = /"retry_after"\s*:\s*(\d+)/.exec(String((e as Error)?.message || ""));
  return m ? Number(m[1]) * 1000 + 300 : 0;
}

/** Permanent failures — retrying never helps. */
function isPermanent(e: unknown): boolean {
  return /blocked|deactivated|chat not found|user not found|bot can't initiate|kicked|PEER_ID_INVALID|have no rights/i.test(
    String((e as Error)?.message || ""),
  );
}

type Log = { chatId: number; messageId?: number };

async function postLogs(text: string, logs: Log[]) {
  await Promise.all(
    logs.map(async (l) => {
      try {
        if (l.messageId) {
          await tg("editMessageText", { chat_id: l.chatId, message_id: l.messageId, text, parse_mode: "HTML" });
        } else {
          const r = await tg("sendMessage", { chat_id: l.chatId, text, parse_mode: "HTML" });
          l.messageId = r?.message_id ?? r?.result?.message_id;
        }
      } catch {
        /* "message is not modified" etc. */
      }
    }),
  );
}

export async function runBroadcast(opts: {
  label: string;
  send: (chatId: number) => Promise<void>;
  adminChatId?: number | undefined;
  ids?: number[];
}): Promise<{ sent: number; total: number; blocked: number; failed: number }> {
  const ids = opts.ids ?? (await allBotUserIds());
  const total = ids.length;
  const adminIds = [...new Set([...(opts.adminChatId ? [opts.adminChatId] : []), ...ownerIds()])];
  const logs: Log[] = adminIds.map((chatId) => ({ chatId }));
  const started = Date.now();

  const sent = new Set<number>();
  const blocked = new Set<number>();
  let pending = ids.slice();
  let lastLog = 0;

  const report = async (final: boolean, round: number) => {
    const done = sent.size + blocked.size;
    const pct = total ? Math.floor((done / total) * 100) : 100;
    const secs = Math.round((Date.now() - started) / 1000);
    const text = final
      ? `✅ <b>Broadcast finished</b> — ${opts.label}\n\n📨 Delivered: <b>${sent.size}/${total}</b>\n🚫 Blocked/unreachable: ${blocked.size}\n⚠️ Failed after retries: ${total - sent.size - blocked.size}\n⏱ ${secs}s`
      : `📣 <b>Broadcasting…</b> — ${opts.label}\n\nProgress: <b>${pct}%</b> (${done}/${total})\n📨 Delivered: ${sent.size}\n🚫 Blocked: ${blocked.size}\n⏳ Remaining: ${total - done}${round > 0 ? `\n🔁 Retry round ${round}` : ""}\n⏱ ${secs}s`;
    await postLogs(text, logs);
  };

  await report(false, 0);

  for (let round = 0; round < MAX_ROUNDS && pending.length; round++) {
    const retry: number[] = [];
    let waitFor = 0;
    for (let i = 0; i < pending.length; i += WAVE) {
      const wave = pending.slice(i, i + WAVE);
      const t0 = Date.now();
      await Promise.all(
        wave.map(async (id) => {
          try {
            await opts.send(id);
            sent.add(id);
          } catch (e) {
            if (isPermanent(e)) blocked.add(id);
            else {
              retry.push(id);
              waitFor = Math.max(waitFor, retryAfterMs(e));
            }
          }
        }),
      );
      if (waitFor) {
        await sleep(waitFor);
        waitFor = 0;
      } else {
        const spent = Date.now() - t0;
        if (spent < WAVE_MS && i + WAVE < pending.length) await sleep(WAVE_MS - spent);
      }
      if (Date.now() - lastLog > 3000) {
        lastLog = Date.now();
        void report(false, round);
      }
    }
    pending = retry;
    if (pending.length) await sleep(2000 * (round + 1));
  }

  await report(true, 0);
  return { sent: sent.size, total, blocked: blocked.size, failed: total - sent.size - blocked.size };
}
