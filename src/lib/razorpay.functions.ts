import { createServerFn } from "@tanstack/react-start";

/** Creates a one-off payment link for a wallet top-up. */
export const createDepositLink = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      usd: number;
      uid: string;
      name?: string;
      email?: string;
      phone?: string;
      siteUrl?: string;
    }) => {
      const usd = Number(input.usd);
      const uid = String(input.uid || "").trim();
      if (!uid) throw new Error("Sign in first.");
      if (!Number.isFinite(usd) || usd <= 0) throw new Error("Enter a valid amount.");
      return {
        usd,
        uid,
        name: String(input.name || ""),
        email: String(input.email || ""),
        phone: String(input.phone || ""),
        siteUrl: String(input.siteUrl || ""),
      };
    },
  )
  .handler(async ({ data }) => {
    const { createPaymentLink } = await import("./razorpay.server");
    return createPaymentLink({ ...data, source: "web" });
  });

/** Tells the website whether card/UPI deposits are switched on, and the rate. */
export const razorpayStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { razorpayConfig } = await import("./razorpay.server");
  const conf = await razorpayConfig();
  return { enabled: Boolean(conf.keyId && conf.keySecret), inrPerDollar: conf.inrPerDollar };
});
