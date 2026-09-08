import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { equalTo, get, onValue, orderByChild, push, query, ref, set, update } from "firebase/database";
import { useStore } from "@/context/StoreContext";
import type { CartItem } from "@/context/StoreContext";

export const Route = createFileRoute("/orders")({
  head: () => ({
    meta: [
      { title: "My Orders — RKR Premium Store" },
      {
        name: "description",
        content: "Track your RKR Premium Store orders, delivery status and wallet refunds.",
      },
      { property: "og:title", content: "My Orders — RKR Premium Store" },
      { property: "og:description", content: "Track your orders and refunds in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Orders,
});

type Order = {
  orderId: string;
  items: CartItem[];
  total: number;
  status: string;
  date: string;
  deliveryNote?: string;
  delivered?: { title: string; content: string }[];
};

function Orders() {
  const { db, user, wallet, openModal, showSuccess } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!db || !user) return;
    return onValue(query(ref(db, "orders"), orderByChild("uid"), equalTo(user.uid)), (s) => {
      const val = s.val() || {};
      setOrders(
        (Object.values(val) as Order[]).sort((a, b) => (a.date < b.date ? 1 : -1)),
      );
    });
  }, [db, user]);

  async function cancelOrder(order: Order) {
    if (!db || !user) return;
    if (!confirm("Cancel this order? The amount is refunded to your wallet.")) return;
    await update(ref(db, `orders/${order.orderId}`), { status: "Cancelled" });
    const w = await get(ref(db, `users/${user.uid}/wallet`));
    await set(ref(db, `users/${user.uid}/wallet`), (Number(w.val()) || 0) + Number(order.total));
    await push(ref(db, `users/${user.uid}/history`), {
      type: "Refund",
      amount: order.total,
      desc: `Cancelled ${order.orderId.slice(-4)}`,
      date: new Date().toISOString(),
    });
    showSuccess("Cancelled", "Amount refunded to your wallet.");
  }

  if (!user) {
    return (
      <div className="fade-in rounded-2xl bg-card p-8 text-center shadow-sm">
        <p className="mb-4 text-sm text-muted-foreground">Log in to see your orders.</p>
        <button
          onClick={() => openModal("auth")}
          className="btn-grad rounded-xl px-6 py-3 text-sm font-bold"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="fade-in">
      <h1 className="mb-4 text-2xl font-black">My orders</h1>
      <p className="mb-4 text-xs text-muted-foreground">Wallet balance: ${wallet}</p>
      {orders.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-xs text-muted-foreground shadow-sm">
          No orders yet.
        </p>
      ) : (
        <div className="space-y-4 pb-10">
          {orders.map((o) => (
            <div key={o.orderId} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-muted-foreground">
                  #{o.orderId.slice(-6)}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${
                    o.status === "Completed"
                      ? "bg-emerald-100 text-emerald-700"
                      : o.status === "Cancelled"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {o.status}
                </span>
              </div>
              <ul className="mb-2 space-y-1 text-sm">
                {(o.items || []).map((i) => (
                  <li key={i.id} className="flex justify-between">
                    <span className="line-clamp-1">
                      {i.title} × {i.qty}
                    </span>
                    <span className="font-bold">${i.price * i.qty}</span>
                  </li>
                ))}
              </ul>
              {(o.delivered || []).length ? (
                <div className="mb-2 space-y-2 rounded-xl bg-emerald-50 p-3">
                  <p className="text-xs font-black text-emerald-700">Your delivery</p>
                  {(o.delivered || []).map((d, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <p className="min-w-0 flex-1 break-all text-xs font-medium text-emerald-800">
                        {d.content}
                      </p>
                      <button
                        onClick={() => navigator.clipboard?.writeText(d.content)}
                        className="shrink-0 rounded-lg bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white"
                      >
                        Copy
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              {o.deliveryNote ? (
                <div className="mb-2 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700">
                  {o.deliveryNote}
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-xs text-muted-foreground">
                  {new Date(o.date).toLocaleString()}
                </span>
                <span className="text-lg font-black">${o.total}</span>
              </div>
              {o.status === "Pending" ? (
                <button
                  onClick={() => cancelOrder(o)}
                  className="mt-3 w-full rounded-xl bg-destructive/10 py-2 text-xs font-bold text-destructive"
                >
                  Cancel & refund
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
