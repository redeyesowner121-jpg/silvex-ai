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

  // Razorpay rejects anything odd here, so only send details it accepts.
  const digits = String(opts.phone || "").replace(/[^\d+]/g, "");
  const contact = digits.length >= 8 && digits.length <= 14 ? digits : "";
  const rawEmail = String(opts.email || "").trim();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : "";
  const name = String(opts.name || "").trim().slice(0, 60);

  const body: Record<string, unknown> = {
    amount: inr * 100,
    currency: "INR",
    accept_partial: false,
    description: `Wallet top-up of $${usd.toFixed(2)}`.slice(0, 60),
    reference_id: `dep_${opts.uid}_${Date.now()}`.slice(0, 40),
    notify: { sms: false, email: Boolean(email) },
    reminder_enable: false,
    notes: {
      uid: opts.uid,
      usd: String(usd),
      source: opts.source,
      email,
    },
  };
  const customer: Record<string, string> = {};
  if (name) customer["name"] = name;
  if (email) customer["email"] = email;
  if (contact) customer["contact"] = contact;
  if (Object.keys(customer).length) body["customer"] = customer;

  let base = String(opts.siteUrl || "").trim().replace(/\/+$/, "");
  if (base && !/^https?:\/\//i.test(base)) base = `https://${base}`;
  if (/^https:\/\/[^\s/]+\.[^\s/]+/i.test(base)) {
    body["callback_url"] = `${base}/profile`;
    body["callback_method"] = "get";
  }

  let res: Response;
  try {
    res = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: authHeader(conf) },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "Could not reach the payment provider. Try again." };
  }
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const desc = String(json?.error?.description || "");
    if (res.status === 401) {
      return { ok: false, error: "Payment keys are wrong. Check the key ID and secret in Settings." };
    }
    return { ok: false, error: desc || `Payment provider error (${res.status})` };
  }
  if (!json?.short_url) return { ok: false, error: "Payment provider did not return a link." };
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
