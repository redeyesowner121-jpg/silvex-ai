import { useState } from "react";
import { ref, update } from "firebase/database";
import { useStore } from "@/context/StoreContext";
import { deliveryBlock, emailShell, sendMail } from "@/lib/mailer";
import { notifyTelegramOrder } from "@/lib/telegram.functions";
import { websiteUrl } from "@/lib/referral";
import { exportOrdersCsv, exportOrdersPdf, type ExportRow } from "@/lib/export-orders";
import { Empty, input, type OrderRow } from "@/components/admin/shared";

export function OrdersAdmin({ orders }: { orders: OrderRow[] }) {
  const { db, products, config, notify, showSuccess } = useStore();
  const [deliverFor, setDeliverFor] = useState<OrderRow | null>(null);
  const [deliverLines, setDeliverLines] = useState<string[]>([]);
  const [deliverNote, setDeliverNote] = useState("");
  const [delivering, setDelivering] = useState(false);

  function deliveryOf(item: { id?: string; title: string }) {
    const product = products.find((entry) => entry.id === item.id || entry.title === item.title);
    return product?.delivery === "auto" ? "Auto stock" : product?.delivery === "repeat" ? "Repeated" : "Manual";
  }

  function exportRows(): ExportRow[] {
    return orders.flatMap((order) => {
      const items = order.items || [];
      if (!items.length) return [{ orderId: order.orderId, date: order.date, buyer: order.email || order.uid, product: "—", delivery: "—", amount: Number(order.total) || 0, status: order.status }];
      return items.map((item, index) => ({
        orderId: order.orderId, date: order.date, buyer: order.email || order.uid,
        product: `${item.title} × ${item.qty}`, delivery: deliveryOf(item),
        amount: item.price != null ? Number(item.price) * Number(item.qty || 1) : index === 0 ? Number(order.total) || 0 : 0,
        status: order.status,
      }));
    });
  }

  function openDelivery(order: OrderRow) {
    setDeliverFor(order);
    setDeliverLines((order.items || []).map((_, index) => order.delivered?.[index]?.content ?? ""));
    setDeliverNote(order.deliveryNote ?? "");
  }

  async function completeDelivery() {
    if (!db || !deliverFor) return;
    const items = deliverFor.items || [];
    const delivered = items.map((item, index) => ({ title: item.title, content: (deliverLines[index] || "").trim() })).filter((item) => item.content);
    if (!delivered.length && !deliverNote.trim()) return notify("Add the delivery details the buyer should see");
    setDelivering(true);
    try {
      await update(ref(db, `orders/${deliverFor.orderId}`), { delivered, deliveryNote: deliverNote.trim(), status: "Completed", deliveredAt: new Date().toISOString() });
      if (deliverFor.email) void sendMail(db, {
        to: deliverFor.email,
        subject: `${config.siteName || "SILENT SELLER"} · Order ${deliverFor.orderId.slice(-6)} delivered`,
        html: emailShell(config.siteName || "SILENT SELLER", "Your order is delivered 🎉", `<p>Thank you for your purchase — your order is complete. Here are your delivery details:</p>${deliveryBlock(delivered)}${deliverNote.trim() ? `<p style="background:#fff8e6;border:1px solid #ffe2a8;border-radius:12px;padding:12px;font-size:14px">${deliverNote.trim()}</p>` : ""}<p style="color:#8a8ca3;font-size:12px">Order ID: ${deliverFor.orderId} · Total: $${Number(deliverFor.total || 0).toFixed(2)}</p>`, { preheader: "Your items are ready", badge: "Delivered", ctaText: "View my order", ctaUrl: `${(config.siteUrl || websiteUrl()).replace(/\/+$/, "")}/orders` }),
        receipt: { orderId: deliverFor.orderId, siteName: config.siteName || "SILENT SELLER", total: Number(deliverFor.total || 0), note: deliverNote.trim() || undefined, items: delivered },
      }).then((result) => { if (!result.ok) notify(`Email not sent: ${result.error}`); });
      void notifyTelegramOrder({ data: { orderId: deliverFor.orderId, email: deliverFor.email || undefined, total: Number(deliverFor.total || 0), status: "Completed", items: items.map((item) => ({ title: item.title, qty: item.qty })), delivered, uid: deliverFor.uid } }).catch(() => undefined);
      setDeliverFor(null);
      showSuccess("Delivered", "The buyer can now see the delivery details.");
    } finally { setDelivering(false); }
  }

  return <div className="space-y-3">
    <div className="grid grid-cols-2 gap-2">
      <button onClick={() => exportOrdersCsv(exportRows(), `orders-${Date.now()}.csv`)} className="rounded-xl bg-card py-2.5 text-xs font-bold shadow-sm">Download CSV</button>
      <button onClick={() => exportOrdersPdf(exportRows(), `${config.siteName || "Store"} — orders report`, `orders-${Date.now()}.pdf`)} className="rounded-xl bg-card py-2.5 text-xs font-bold shadow-sm">Download PDF</button>
    </div>
    {orders.map((order) => <div key={order.orderId} className="rounded-2xl border border-border bg-card p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs font-bold"><span className="truncate">#{order.orderId.slice(-6)}</span><span>{order.status}</span></div>
      <p className="mt-1 break-words text-xs text-muted-foreground">{order.email} · {order.phone}</p>
      <ul className="my-2 text-sm">{(order.items || []).map((item, index) => <li key={index}>{item.title} × {item.qty}</li>)}</ul>
      <p className="text-lg font-black">${order.total}</p>
      {order.delivered?.length ? <div className="mt-2 space-y-1 rounded-xl bg-muted/60 p-2 text-[11px]">{order.delivered.map((item, index) => <p key={index} className="break-all"><b>{item.title}:</b> {item.content}</p>)}</div> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => openDelivery(order)} className="rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white">{order.status === "Completed" ? "Edit delivery" : "Complete delivery"}</button>
        <button onClick={() => db && update(ref(db, `orders/${order.orderId}`), { status: "Cancelled" }).then(() => notify("Order marked Cancelled"))} className="rounded-lg bg-destructive py-2 text-xs font-bold text-destructive-foreground">Cancel</button>
      </div>
      {deliverFor?.orderId === order.orderId ? <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
        <p className="text-xs font-black">Delivery details</p>
        {(order.items || []).map((item, index) => <label key={index} className="block text-[11px] font-bold text-muted-foreground">{item.title} × {item.qty}<textarea className={`${input} mt-1`} rows={2} value={deliverLines[index] ?? ""} onChange={(event) => { const next = [...deliverLines]; next[index] = event.target.value; setDeliverLines(next); }} /></label>)}
        <textarea className={input} rows={2} placeholder="Note for the buyer (optional)" value={deliverNote} onChange={(event) => setDeliverNote(event.target.value)} />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><button disabled={delivering} onClick={completeDelivery} className="rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white disabled:opacity-60">{delivering ? "Sending…" : "Mark delivered & notify buyer"}</button><button onClick={() => setDeliverFor(null)} className="rounded-lg bg-muted px-3 py-2 text-xs font-bold">Close</button></div>
      </div> : null}
    </div>)}
    {!orders.length ? <Empty text="No orders yet." /> : null}
  </div>;
}