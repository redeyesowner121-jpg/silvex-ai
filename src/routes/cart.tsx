import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { get, ref } from "@/lib/fb/database";
import { useStore } from "@/context/StoreContext";
import { deliveryBlock, emailShell, itemsTable, sendMail } from "@/lib/mailer";
import { notifyTelegramOrder } from "@/lib/telegram.functions";
import { websiteUrl } from "@/lib/referral";
import { checkoutCart } from "@/lib/wallet.functions";

import { Emo } from "@/components/store/Emo";
import { productImageSrc } from "@/lib/product-image";


export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart — Silvex AI" },
      {
        name: "description",
        content: "Review your items, apply a promo code and pay instantly from your wallet.",
      },
      { property: "og:title", content: "Your Cart — Silvex AI" },
      { property: "og:description", content: "Review items and pay instantly from your wallet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cart,
});

function Cart() {
  const { db, user, profile, cart, cartTotal, setQty, clearCart, wallet, config, openModal, showSuccess, notify, siteName, emoji } =
    useStore();
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [editPhone, setEditPhone] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Remember the WhatsApp number: once saved on the profile it is reused automatically.
  useEffect(() => {
    if (profile?.phone) setPhone(profile.phone);
  }, [profile?.phone]);

  const total = Math.max(0, cartTotal - discount);

  async function applyCoupon() {
    if (!db || !user) return openModal("auth");
    const code = coupon.trim().toUpperCase();
    if (!code) return;
    const snap = await get(ref(db, `coupons/${code}`));
    if (!snap.exists()) {
      setDiscount(0);
      return setCouponMsg("Invalid code");
    }
    const c = snap.val();
    if (cartTotal < Number(c.minOrder || 0)) {
      setDiscount(0);
      return setCouponMsg(`Minimum order $${c.minOrder}`);
    }
    const used = await get(ref(db, `users/${user.uid}/used_coupons/${code}`));
    if ((Number(used.val()) || 0) >= Number(c.maxUsage || 1)) {
      setDiscount(0);
      return setCouponMsg("Already used!");
    }
    const value =
      c.type === "percent"
        ? Math.round((cartTotal * Number(c.value)) / 100)
        : Number(c.value);
    setDiscount(value);
    setCouponMsg(`Coupon applied: −$${value}`);
  }

  async function checkout() {
    if (!user || !db) return openModal("auth");
    if (cart.length === 0) return;
    const soldOutItem = cart.find((i) => i.soldOut);
    if (soldOutItem) return notify(`${soldOutItem.title} is out of stock`);
    if (phone.length < 10) return notify("Enter your WhatsApp number");
    if (wallet < total) return notify("Not enough wallet balance");
    setBusy(true);
    try {
      const res = await checkoutCart({
        data: {
          idToken: await user.getIdToken(),
          items: cart.map((i) => ({ id: i.id, qty: i.qty })),
          coupon: discount > 0 ? coupon.trim().toUpperCase() : undefined,
          phone,
          note,
        },
      });
      if (!res.ok) return notify(res.error);
      const { orderId, delivered, total } = res;
      const allDelivered = res.status === "Completed";
      const partialRefunds = res.refunded > 0 ? [{ amount: res.refunded }] : [];
      if (user.email) {
        const done = allDelivered;
        sendMail(db, {
          to: user.email,
          subject: `${siteName} · Order ${orderId.slice(-6)} ${done ? "delivered" : "received"}`,
          html: emailShell(
            siteName,
            done ? `Your order is delivered ${emoji("web.party")}` : `Order received ${emoji("web.ok")}`,
            `<p>Hi${user.displayName ? " " + user.displayName : ""}, thanks for your purchase.</p>
             ${itemsTable(
               res.items.map((i) => ({ title: i.title, qty: i.qty, amount: i.price * i.qty })),
               total,
             )}
             ${done ? "<p><b>Your delivery details:</b></p>" + deliveryBlock(delivered) : "<p>Our team is preparing your order. You will get another email the moment it is delivered.</p>"}
             <p style="color:#8a8ca3;font-size:12px">Order ID: ${orderId}</p>`,
            {
              preheader: done ? "Your items are ready" : "We received your order",
              ctaText: "View my order",
              ctaUrl: `${(config.siteUrl || websiteUrl()).replace(/\/+$/, "")}/orders`,
            },
          ),
          ...(done ? { receipt: { orderId, siteName, total, items: delivered } } : {}),
        }).then((r) => {
          if (!r.ok) notify(`Email not sent: ${r.error}`);
        });
      }

      void notifyTelegramOrder({
        data: {
          orderId,
          email: user.email || undefined,
          total,
          status: delivered.length && allDelivered ? "Completed" : "Pending",
          items: cart.map((i) => ({ title: i.title, qty: i.qty })),
          delivered,
          uid: user.uid,
        },
      }).catch(() => undefined);
      clearCart();

      setDiscount(0);
      showSuccess(
        delivered.length && allDelivered ? "Delivered!" : "Order placed",
        delivered.length && allDelivered
          ? "Your item is ready in Orders."
          : partialRefunds.length
            ? `Some items were unavailable — $${partialRefunds.reduce((s, pr) => s + pr.amount, 0).toFixed(2)} was refunded to your wallet.`
            : "We'll deliver it shortly. Check Orders for status.",
      );
      navigate({ to: "/orders" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fade-in">
      <h1 className="mb-4 text-2xl font-black">My cart</h1>
      {cart.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-xs text-muted-foreground shadow-sm">
          Your cart is empty.
        </p>
      ) : (
        <>
          <div className="mb-6 space-y-3">
            {cart.map((i) => (
              <div
                key={i.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
              >
                {i.logo ? (
                  <img src={productImageSrc(i.id, i.logo)} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
                    <Emo k="web.bag" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="line-clamp-1 text-sm font-bold">{i.title}</h3>
                  {i.discountLabel ? (
                    <span className="text-[10px] font-bold text-destructive">{i.discountLabel}</span>
                  ) : null}
                  <p className="text-sm font-black">${i.price}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQty(i.id, i.qty - 1)}
                    className="h-7 w-7 rounded-lg bg-muted font-bold"
                  >
                    −
                  </button>
                  <span className="w-4 text-center text-sm font-bold">{i.qty}</span>
                  <button
                    onClick={() => setQty(i.id, i.qty + 1)}
                    className="h-7 w-7 rounded-lg bg-muted font-bold"
                  >
                    ＋
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-bold text-muted-foreground">Total payable</span>
              <span className="text-3xl font-black text-primary">${total}</span>
            </div>
            <div className="mb-2 flex gap-2">
              <input
                value={coupon}
                onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                placeholder="PROMO CODE"
                className="flex-1 rounded-xl border border-border bg-muted/60 p-3 text-xs font-bold uppercase outline-none"
              />
              <button
                onClick={applyCoupon}
                className="rounded-xl bg-foreground px-4 text-xs font-bold text-background"
              >
                Apply
              </button>
            </div>
            {couponMsg ? (
              <p className="mb-3 text-center text-xs font-bold text-primary">{couponMsg}</p>
            ) : null}
            {profile?.phone && !editPhone ? (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-muted/60 p-3">
                <p className="flex-1 text-sm">
                  <span className="text-muted-foreground">WhatsApp: </span>
                  <span className="font-bold">{profile.phone}</span>
                </p>
                <button
                  onClick={() => setEditPhone(true)}
                  className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-bold text-background"
                >
                  Change
                </button>
              </div>
            ) : (
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="WhatsApp number (required)"
                className="mb-3 w-full rounded-xl border border-border bg-muted/60 p-3 text-sm outline-none"
              />
            )}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Email / ID (optional)"
              className="mb-5 w-full rounded-xl border border-border bg-muted/60 p-3 text-sm outline-none"
            />
            <p className="mb-3 text-center text-xs text-muted-foreground">
              Wallet balance: <span className="font-bold">${wallet}</span>
            </p>
            <button
              onClick={checkout}
              disabled={busy}
              className="btn-grad w-full rounded-xl py-3.5 text-sm font-bold disabled:opacity-60"
            >
              Pay from wallet
            </button>
          </div>
        </>
      )}
    </div>
  );
}
