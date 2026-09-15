import { createFileRoute } from "@tanstack/react-router";

/**
 * Razorpay calls this address on its own after every payment, so deposits are
 * credited without anyone pressing anything.
 */
export const Route = createFileRoute("/api/public/razorpay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const signature = request.headers.get("x-razorpay-signature") || "";
        const { verifyWebhook } = await import("@/lib/razorpay.server");
        if (!(await verifyWebhook(raw, signature))) {
          return new Response("Invalid signature", { status: 401 });
        }

        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("Bad payload", { status: 400 });
        }

        const event = String(body?.event || "");
        const paid =
          event === "payment_link.paid" ||
          event === "payment.captured" ||
          event === "order.paid";
        if (!paid) return new Response("ignored");

        const payment = body?.payload?.payment?.entity ?? {};
        const link = body?.payload?.payment_link?.entity ?? {};
        const notes = { ...(link.notes || {}), ...(payment.notes || {}) } as Record<string, string>;
        const uid = String(notes["uid"] || "").trim();

        // Only real, captured money counts. Without a payment id we cannot tell
        // one payment from another, so we never credit on a link id alone.
        const paymentId = String(payment.id || "");
        const status = String(payment.status || "");
        const inrPaid = Number(payment.amount ?? 0) / 100;
        if (!paymentId || (status && status !== "captured") || !(inrPaid > 0)) {
          return new Response("ignored");
        }

        const { razorpayConfig, creditDeposit } = await import("@/lib/razorpay.server");
        const conf = await razorpayConfig();
        const usd =
          Number(notes["usd"]) > 0
            ? Number(notes["usd"])
            : Math.round((inrPaid / conf.inrPerDollar) * 100) / 100;

        if (!uid || !(usd > 0)) return new Response("ignored");

        await creditDeposit({
          uid,
          usd,
          inr: inrPaid,
          paymentId,
          linkId: String(link.id || ""),
          email: notes["email"] || "",
        });

        return new Response("ok");
      },
      GET: async () => new Response("Razorpay webhook is live"),
    },
  },
});
