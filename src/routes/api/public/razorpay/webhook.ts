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
        const paymentId = String(payment.id || link.id || "");
        const inrPaid = Number(payment.amount ?? link.amount_paid ?? 0) / 100;

        const { dbGet, dbPut, dbPush, notifyOwners, money } = await import("@/lib/telegram.server");
        const { razorpayConfig } = await import("@/lib/razorpay.server");
        const conf = await razorpayConfig();
        const usd =
          Number(notes["usd"]) > 0
            ? Number(notes["usd"])
            : Math.round((inrPaid / conf.inrPerDollar) * 100) / 100;

        if (!uid || !paymentId || !(usd > 0)) return new Response("ignored");

        // One payment can only ever be credited once.
        const seen = await dbGet<any>(`razorpayPayments/${paymentId}`).catch(() => null);
        if (seen) return new Response("ok");

        const date = new Date().toISOString();
        await dbPut(`razorpayPayments/${paymentId}`, {
          uid,
          usd,
          inr: inrPaid,
          status: "Credited",
          email: notes["email"] || "",
          date,
        });

        const current = Number((await dbGet<number>(`users/${uid}/wallet`)) || 0);
        await dbPut(`users/${uid}/wallet`, Math.round((current + usd) * 100) / 100);
        await dbPush(`users/${uid}/history`, {
          type: "Deposit",
          amount: usd,
          desc: `Card/UPI payment (₹${inrPaid.toFixed(0)})`,
          date,
        });

        // Telegram buyers get the good news right inside the bot.
        const tgId = Number(uid.startsWith("tg_") ? uid.slice(3) : 0);
        if (tgId > 0) {
          const { tgSend } = await import("@/lib/telegram.server");
          const bal = Math.round((current + usd) * 100) / 100;
          await tgSend(
            tgId,
            `✅ <b>Deposit done</b>\n${money(usd)} added by card/UPI (₹${inrPaid.toFixed(0)}).\nNew balance: <b>${money(bal)}</b>`,
          ).catch(() => undefined);
        }

        await notifyOwners(
          `💳 Deposit credited\nUser: ${uid}\nAmount: ${money(usd)} (₹${inrPaid.toFixed(0)})\nPayment: ${paymentId}`,
        ).catch(() => undefined);

        return new Response("ok");
      },
      GET: async () => new Response("Razorpay webhook is live"),
    },
  },
});
