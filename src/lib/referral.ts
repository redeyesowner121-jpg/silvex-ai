/** Referral programme: 2% of every purchase a referred friend makes, capped per friend. */
export const REFERRAL_RATE = 0.02;
/** Maximum total commission one friend can earn you. */
export const REFERRAL_CAP = 201;
export const BOT_USERNAME = "silvexaibot";
export const WEBSITE_URL = "https://silvex-ai.com";

export function websiteReferralLink(code: string) {
  return `${WEBSITE_URL}/?ref=${code}`;
}
export function botReferralLink(code: string) {
  return `https://t.me/${BOT_USERNAME}?start=${code}`;
}

export type HistoryEntry = { type?: string; amount?: number; date?: string };

/** Today / this week / this month / all-time referral earnings from a user's history list. */
export function referralEarnings(history: HistoryEntry[]) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfDay - ((now.getDay() + 6) % 7) * 86400000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let today = 0,
    week = 0,
    month = 0,
    total = 0;
  for (const h of history) {
    if (!h || !String(h.type || "").toLowerCase().startsWith("referral")) continue;
    const amt = Number(h.amount) || 0;
    const t = h.date ? new Date(h.date).getTime() : 0;
    total += amt;
    if (t >= startOfMonth) month += amt;
    if (t >= startOfWeek) week += amt;
    if (t >= startOfDay) today += amt;
  }
  return { today, week, month, total };
}
