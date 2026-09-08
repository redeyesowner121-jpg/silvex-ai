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

/** Branded HTML wrapper used for every transactional email. */
export function emailShell(
  siteName: string,
  title: string,
  body: string,
  opts?: { preheader?: string; ctaText?: string; ctaUrl?: string },
) {
  const cta =
    opts?.ctaText && opts?.ctaUrl
      ? `<tr><td style="padding:8px 0 4px">
           <a href="${opts.ctaUrl}" style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 26px;border-radius:12px">${opts.ctaText}</a>
         </td></tr>`
      : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef0f6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${opts?.preheader || title}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f6;padding:28px 12px;font-family:'Segoe UI',Arial,Helvetica,sans-serif">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 30px rgba(24,24,60,.10)">
      <tr><td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:26px 28px">
        <div style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.4px">${siteName}</div>
        <div style="color:#e5e0ff;font-size:12px;margin-top:4px">Premium digital store</div>
      </td></tr>
      <tr><td style="padding:28px">
        <h1 style="margin:0 0 14px;font-size:20px;color:#15162b">${title}</h1>
        <div style="font-size:14px;color:#3d3f57;line-height:1.7">${body}</div>
        <table role="presentation" cellpadding="0" cellspacing="0">${cta}</table>
      </td></tr>
      <tr><td style="background:#f7f7fb;padding:18px 28px;border-top:1px solid #ececf4">
        <div style="font-size:12px;color:#8a8ca3;line-height:1.6">
          Need help? Just reply to this email — our team answers 24/7.<br/>
          This is an automated message from ${siteName}.
        </div>
      </td></tr>
    </table>
    <div style="font-size:11px;color:#9a9cb0;margin-top:14px">© ${new Date().getFullYear()} ${siteName}</div>
  </td></tr>
</table>
</body></html>`;
}

/** Neat items table used inside order emails. */
export function itemsTable(
  rows: { title: string; qty: number; amount: number }[],
  total: number,
) {
  const body = rows
    .map(
      (r) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #f0f0f6">${r.title} <span style="color:#8a8ca3">× ${r.qty}</span></td>
         <td align="right" style="padding:10px 0;border-bottom:1px solid #f0f0f6;white-space:nowrap">$${r.amount.toFixed(2)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:6px 0 18px">
    ${body}
    <tr><td style="padding:12px 0;font-weight:800">Total</td><td align="right" style="padding:12px 0;font-weight:800">$${total.toFixed(2)}</td></tr>
  </table>`;
}

/** Delivery details block (codes / links the buyer receives). */
export function deliveryBlock(items: { title: string; content: string }[]) {
  if (!items.length) return "";
  return items
    .map(
      (d) => `<div style="background:#f5f4ff;border:1px solid #e3e0ff;border-radius:12px;padding:14px;margin:10px 0">
        <div style="font-size:12px;font-weight:800;color:#4f46e5;margin-bottom:6px">${d.title}</div>
        <div style="font-family:Consolas,monospace;font-size:13px;color:#15162b;word-break:break-all;white-space:pre-wrap">${d.content}</div>
      </div>`,
    )
    .join("");
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
