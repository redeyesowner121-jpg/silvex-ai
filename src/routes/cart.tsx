import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { get, push, ref, runTransaction, set } from "firebase/database";
import { useStore } from "@/context/StoreContext";
import { emailShell, sendMail } from "@/lib/mailer";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart — SILENT SELLER" },
      {
        name: "description",
        content: "Review your items, apply a promo code and pay instantly from your wallet.",
      },
      { property: "og:title", content: "Your Cart — SILENT SELLER" },
      { property: "og:description", content: "Review items and pay instantly from your wallet." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Cart,
});

function Cart() {
  const { db, user, cart, cartTotal, setQty, clearCart, wallet, openModal, showSuccess, notify, siteName } =
    useStore();
  const navigate = useNavigate();
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponMsg, setCouponMsg] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

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
    if (phone.length < 10) return notify("Enter your WhatsApp number");
    if (wallet < total) return notify("Not enough wallet balance");
    setBusy(true);
    try {
      const orderId = "ORD" + Date.now();

      // Deliver instantly where possible: auto = pull stock lines, repeat = same link.
      const delivered: { title: string; content: string }[] = [];
      let allDelivered = true;
      for (const item of cart) {
        const snap = await get(ref(db, `products/${item.id}`));
        const p = snap.val() || {};
        if (p.delivery === "repeat" && p.link) {
          for (let n = 0; n < item.qty; n++) delivered.push({ title: item.title, content: p.link });
          continue;
        }
        if (p.delivery === "auto") {
          let taken: string[] = [];
          await runTransaction(ref(db, `products/${item.id}/stock`), (cur) => {
            const list: string[] = Array.isArray(cur) ? cur.filter(Boolean) : [];
            if (list.length < item.qty) {
              taken = [];
              return cur;
            }
            taken = list.slice(0, item.qty);
            return list.slice(item.qty);
          });
          if (taken.length === item.qty) {
            taken.forEach((content) => delivered.push({ title: item.title, content }));
            // keep a record of used stock for the admin
            await Promise.all(
              taken.map((content) =>
                push(ref(db, `products/${item.id}/usedStock`), {
                  content,
                  orderId,
                  email: user.email || "",
                  date: new Date().toISOString(),
                }),
              ),
            );
            continue;
          }
        }
        allDelivered = false;
      }


      await set(ref(db, `users/${user.uid}/wallet`), wallet - total);
      await set(ref(db, `orders/${orderId}`), {
        orderId,
        uid: user.uid,
        email: user.email,
        items: cart,
        subTotal: cartTotal,
        couponDiscount: discount,
        couponCode: discount > 0 ? coupon.trim().toUpperCase() : null,
        total,
        phone,
        note,
        delivered,
        status: delivered.length && allDelivered ? "Completed" : "Pending",
        date: new Date().toISOString(),
      });
      await push(ref(db, `users/${user.uid}/history`), {
        type: "Purchase",
        amount: total,
        desc: `Order ${orderId.slice(-4)}`,
        date: new Date().toISOString(),
      });
      if (discount > 0) {
        await runTransaction(
          ref(db, `users/${user.uid}/used_coupons/${coupon.trim().toUpperCase()}`),
          (v) => (v || 0) + 1,
        );
      }
      await Promise.all(
        cart.map((i) => runTransaction(ref(db, `products/${i.id}/salesCount`), (c) => (c || 0) + 1)),
      );
      if (user.email) {
        const rows = cart
          .map((i) => `<tr><td>${i.title} x${i.qty}</td><td align="right">$${(i.price * i.qty).toFixed(2)}</td></tr>`)
          .join("");
        void sendMail(db, {
          to: user.email,
          subject: `Order ${orderId.slice(-6)} confirmed`,
          html: emailShell(
            siteName,
            delivered.length && allDelivered ? "Your order is delivered" : "Order received",
            `<table width="100%">${rows}<tr><td><b>Total</b></td><td align="right"><b>$${total.toFixed(2)}</b></td></tr></table>
             <p>${delivered.length && allDelivered ? "Your items are ready in My Orders." : "We will deliver it shortly. Track it in My Orders."}</p>`,
          ),
        });
      }
      clearCart();
      setDiscount(0);
      showSuccess(
        delivered.length && allDelivered ? "Delivered!" : "Order placed",
        delivered.length && allDelivered
          ? "Your item is ready in My Orders."
          : "We'll deliver it shortly. Check My Orders for status.",
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
                  <img src={i.logo} alt="" className="h-14 w-14 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
                    🛍️
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
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="WhatsApp number (required)"
              className="mb-3 w-full rounded-xl border border-border bg-muted/60 p-3 text-sm outline-none"
            />
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
