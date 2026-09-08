import { get, ref, type Database } from "firebase/database";
import { sendSmtpMail, type SmtpSettings } from "./mail.functions";

export type MailConfig = SmtpSettings & { enabled?: boolean };

export async function loadMailConfig(db: Database | null): Promise<MailConfig | null> {
  if (!db) return null;
  const snap = await get(ref(db, "site_settings/smtp"));
  const cfg = snap.val() as MailConfig | null;
  if (!cfg?.enabled || !cfg.host || !cfg.username || !cfg.password || !cfg.fromEmail) return null;
  return cfg;
}

export function emailShell(siteName: string, title: string, body: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f5f5f7;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:24px">
    <div style="font-size:18px;font-weight:800;color:#4f46e5">${siteName}</div>
    <h1 style="font-size:18px;margin:16px 0 8px">${title}</h1>
    <div style="font-size:14px;color:#333;line-height:1.6">${body}</div>
    <p style="font-size:12px;color:#888;margin-top:24px">This is an automated message from ${siteName}.</p>
  </div>
</div>`;
}

/** Fire-and-forget mail send; never throws into the UI flow. */
export async function sendMail(
  db: Database | null,
  opts: { to: string; subject: string; html: string },
) {
  try {
    const smtp = await loadMailConfig(db);
    if (!smtp) return { ok: false as const, error: "Email not configured" };
    return await sendSmtpMail({ data: { smtp, ...opts } });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Send failed" };
  }
}
