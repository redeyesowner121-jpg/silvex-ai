/** Server-only Razorpay payment links + webhook verification. */
import { dbGet } from "./telegram.server";

export type RazorpayConf = {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
  /** How many rupees equal one dollar (default 100). */
  inrPerDollar: number;
};

/** Admin panel settings first, project secrets as fallback. */
export async function razorpayConfig(): Promise<RazorpayConf> {
  const c = (await dbGet<any>("site_settings/config").catch(() => null)) || {};
  return {
    keyId: String(c.razorpayKeyId || process.env["RAZORPAY_KEY_ID"] || "").trim(),
    keySecret: String(c.razorpayKeySecret || process.env["RAZORPAY_KEY_SECRET"] || "").trim(),
    webhookSecret: String(
      c.razorpayWebhookSecret || process.env["RAZORPAY_WEBHOOK_SECRET"] || "",
    ).trim(),
    inrPerDollar: Number(c.inrPerDollar) > 0 ? Number(c.inrPerDollar) : 100,
  };
}

function authHeader(conf: RazorpayConf): string {
  const raw = `${conf.keyId}:${conf.keySecret}`;
  // btoa is available in the Worker runtime.
  return `Basic ${btoa(raw)}`;
}

export type LinkResult = { ok: true; url: string; id: string; inr: number } | { ok: false; error: string };

/** Creates a unique payment link for one deposit. */
export async function createPaymentLink(opts: {
  usd: number;
  uid: string;
  name?: string;
  email?: string;
  phone?: string;
  source: "web" | "telegram";
  siteUrl?: string;
}): Promise<LinkResult> {
  const conf = await razorpayConfig();
  if (!conf.keyId || !conf.keySecret) {
    return { ok: false, error: "Card/UPI payments are not set up yet." };
  }
  const usd = Math.round(Number(opts.usd) * 100) / 100;
  if (!usd || usd <= 0) return { ok: false, error: "Enter a valid amount." };
  const inr = Math.round(usd * conf.inrPerDollar);
  if (inr < 1) return { ok: false, error: "Amount is too small." };

  const body: Record<string, unknown> = {
    amount: inr * 100,
    currency: "INR",
    accept_partial: false,
    description: `Wallet top-up of $${usd.toFixed(2)}`,
    reference_id: `dep_${opts.uid}_${Date.now()}`,
    notify: { sms: false, email: Boolean(opts.email) },
    reminder_enable: false,
    notes: {
      uid: opts.uid,
      usd: String(usd),
      source: opts.source,
      email: opts.email || "",
    },
  };
  const customer: Record<string, string> = {};
  if (opts.name) customer["name"] = opts.name;
  if (opts.email) customer["email"] = opts.email;
  if (opts.phone) customer["contact"] = opts.phone;
  if (Object.keys(customer).length) body["customer"] = customer;
  if (opts.siteUrl) {
    body["callback_url"] = `${opts.siteUrl.replace(/\/+$/, "")}/profile`;
    body["callback_method"] = "get";
  }

  const res = await fetch("https://api.razorpay.com/v1/payment_links", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: authHeader(conf) },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    return { ok: false, error: json?.error?.description || `Payment provider error (${res.status})` };
  }
  return { ok: true, url: String(json.short_url), id: String(json.id), inr };
}

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafe(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** True when the raw body really came from Razorpay. */
export async function verifyWebhook(rawBody: string, signature: string): Promise<boolean> {
  const conf = await razorpayConfig();
  if (!conf.webhookSecret || !signature) return false;
  return timingSafe(await hmacHex(conf.webhookSecret, rawBody), signature.trim());
}
