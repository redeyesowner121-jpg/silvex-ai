import { get, ref, type Database } from "firebase/database";
import { sendSmtpMail, type MailReceipt, type SmtpSettings } from "./mail.functions";

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
  opts?: { preheader?: string; ctaText?: string; ctaUrl?: string; badge?: string },
) {
  const initial = (siteName || "S").trim().slice(0, 1).toUpperCase();
  const cta =
    opts?.ctaText && opts?.ctaUrl
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 4px"><tr><td style="border-radius:14px;background:#4f46e5">
           <a href="${opts.ctaUrl}" style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 30px;border-radius:14px">${opts.ctaText} →</a>
         </td></tr></table>`
      : "";
  const badge = opts?.badge
    ? `<div style="display:inline-block;background:#eef0ff;color:#4f46e5;font-size:11px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;padding:6px 12px;border-radius:999px;margin-bottom:14px">${opts.badge}</div>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#eef0f6;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${opts?.preheader || title}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f6;padding:32px 12px;font-family:'Segoe UI',Roboto,Arial,Helvetica,sans-serif">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 16px 40px rgba(24,24,60,.12)">
      <tr><td style="background:#4f46e5;background-image:linear-gradient(135deg,#4f46e5 0%,#7c3aed 55%,#a855f7 100%);padding:28px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:12px">
            <div style="width:42px;height:42px;border-radius:14px;background:rgba(255,255,255,.18);color:#ffffff;font-size:19px;font-weight:800;text-align:center;line-height:42px">${initial}</div>
          </td>
          <td>
            <div style="color:#ffffff;font-size:19px;font-weight:800;letter-spacing:.3px">${siteName}</div>
            <div style="color:#e3dcff;font-size:12px;margin-top:3px">Premium digital store</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:30px 30px 26px">
        ${badge}
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#15162b;font-weight:800">${title}</h1>
        <div style="font-size:15px;color:#3d3f57;line-height:1.75">${body}</div>
        ${cta}
      </td></tr>
      <tr><td style="background:#f7f7fb;padding:20px 30px;border-top:1px solid #ececf4">
        <div style="font-size:12px;color:#8a8ca3;line-height:1.7">
          Need help? Just reply to this email — our team answers 24/7.<br/>
          This is an automated message from ${siteName}.
        </div>
      </td></tr>
    </table>
    <div style="font-size:11px;color:#9a9cb0;margin-top:16px">© ${new Date().getFullYear()} ${siteName} · All rights reserved</div>
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
        `<tr><td style="padding:12px 14px;border-bottom:1px solid #eeeef6;font-size:14px;color:#15162b">${r.title}<div style="color:#8a8ca3;font-size:12px;margin-top:2px">Quantity: ${r.qty}</div></td>
         <td align="right" style="padding:12px 14px;border-bottom:1px solid #eeeef6;white-space:nowrap;font-size:14px;font-weight:700;color:#15162b">$${r.amount.toFixed(2)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 20px;border:1px solid #eeeef6;border-radius:16px;overflow:hidden">
    ${body}
    <tr><td style="padding:14px;font-weight:800;font-size:15px;background:#faf9ff">Total paid</td><td align="right" style="padding:14px;font-weight:800;font-size:15px;background:#faf9ff;color:#4f46e5">$${total.toFixed(2)}</td></tr>
  </table>`;
}

/** Delivery details block (codes / links the buyer receives). */
export function deliveryBlock(items: { title: string; content: string }[]) {
  if (!items.length) return "";
  return items
    .map(
      (d) => `<div style="background:#f6f5ff;border:1px solid #e3e0ff;border-radius:16px;padding:16px;margin:12px 0">
        <div style="font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:#4f46e5;margin-bottom:8px">${d.title}</div>
        <div style="background:#ffffff;border:1px dashed #cfc9ff;border-radius:12px;padding:12px;font-family:Consolas,'Courier New',monospace;font-size:13px;color:#15162b;word-break:break-all;white-space:pre-wrap">${d.content}</div>
      </div>`,
    )
    .join("");
}

/** Fire-and-forget mail send; never throws into the UI flow. */
export async function sendMail(
  db: Database | null,
  opts: { to: string; subject: string; html: string; receipt?: MailReceipt },
) {
  try {
    const smtp = await loadMailConfig(db);
    if (!smtp) return { ok: false as const, error: "Email not configured" };
    return await sendSmtpMail({ data: { smtp, ...opts } });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : "Send failed" };
  }
}
