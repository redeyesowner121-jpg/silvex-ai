import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { get, onValue, push, ref, remove, set, update } from "firebase/database";
import { useStore, isOwnerEmail, type Product, type Category } from "@/context/StoreContext";
import { fileToCompressedDataUrl } from "@/lib/image-upload";
import { exportOrdersCsv, exportOrdersPdf, type ExportRow } from "@/lib/export-orders";
import { sendSmtpMail } from "@/lib/mail.functions";
import { deliveryBlock, emailShell, sendMail } from "@/lib/mailer";
import { notifyTelegramOrder } from "@/lib/telegram.functions";
import { websiteUrl } from "@/lib/referral";


import { input, Stat, Empty, ImageField, type OrderRow } from "@/components/admin/shared";
import { lazy, Suspense } from "react";
import { SECTIONS, type Section, type Tab, type RequestRow } from "@/components/admin/shared";

const Dashboard = lazy(() => import("@/components/admin/Dashboard").then((m) => ({ default: m.Dashboard })));
const ProductsAdmin = lazy(() => import("@/components/admin/ProductsAdmin").then((m) => ({ default: m.ProductsAdmin })));
const UsersAdmin = lazy(() => import("@/components/admin/UsersAdmin").then((m) => ({ default: m.UsersAdmin })));
const CouponsAdmin = lazy(() => import("@/components/admin/CouponsAdmin").then((m) => ({ default: m.CouponsAdmin })));
const ButtonsAdmin = lazy(() => import("@/components/admin/ButtonsAdmin").then((m) => ({ default: m.ButtonsAdmin })));
const SettingsAdmin = lazy(() => import("@/components/admin/SettingsAdmin").then((m) => ({ default: m.SettingsAdmin })));
const ProvidersAdmin = lazy(() => import("@/components/admin/ProvidersAdmin").then((m) => ({ default: m.ProvidersAdmin })));
const RailwayAdmin = lazy(() => import("@/components/admin/RailwayAdmin").then((m) => ({ default: m.RailwayAdmin })));


export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin Panel — SILENT SELLER" },
      { name: "description", content: "Manage products, orders, wallet requests and store settings." },
      { property: "og:title", content: "Admin Panel — SILENT SELLER" },
      { property: "og:description", content: "Store management for SILENT SELLER admins." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: string } =>
    typeof search["tab"] === "string" ? { tab: search["tab"] } : {},
  component: Admin,
});

function Admin() {
  const search = Route.useSearch();
  const { db, isAdmin, ready, user, products, config, banner, notify, showSuccess } = useStore();
  const requestedTab = search.tab as Tab | undefined;
  const initialTab = requestedTab && Object.values(SECTIONS).flat().includes(requestedTab)
    ? requestedTab
    : "Dashboard";
  const initialSection = (Object.keys(SECTIONS) as Section[]).find((key) =>
    (SECTIONS[key] as readonly string[]).includes(initialTab),
  ) ?? "Analysis";
  const [section, setSection] = useState<Section>(initialSection);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [coupons, setCoupons] = useState<Array<{ code: string; type: string; value: number }>>([]);
  const [deliverFor, setDeliverFor] = useState<OrderRow | null>(null);
  const [deliverLines, setDeliverLines] = useState<string[]>([]);
  const [deliverNote, setDeliverNote] = useState("");
  const [delivering, setDelivering] = useState(false);



  useEffect(() => {
    if (!db || !isAdmin) return;
    const un1 = onValue(ref(db, "orders"), (s) =>
      setOrders(
        (Object.values(s.val() || {}) as OrderRow[]).sort((a, b) => (a.date < b.date ? 1 : -1)),
      ),
    );
    const un2 = onValue(ref(db, "requests"), (s) =>
      setRequests(
        Object.entries(s.val() || {})
          .map(([id, r]) => ({ id, ...(r as Omit<RequestRow, "id">) }))
          .sort((a, b) => (a.date < b.date ? 1 : -1)),
      ),
    );
    const un3 = onValue(ref(db, "coupons"), (s) =>
      setCoupons(
        Object.entries(s.val() || {}).map(([code, c]) => ({
          code,
          ...(c as { type: string; value: number }),
        })),
      ),
    );
    return () => {
      un1();
      un2();
      un3();
    };
  }, [db, isAdmin]);

  if (!ready) return <p className="py-20 text-center text-sm text-muted-foreground">Loading…</p>;

  if (!user || !isAdmin) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-black">Admin only</h1>
        <p className="text-sm text-muted-foreground">
          This area is for store admins. Ask an existing admin to enable admin access on your
          account.
        </p>
      </div>
    );
  }

  async function setOrderStatus(o: OrderRow, status: string) {
    if (!db) return;
    await update(ref(db, `orders/${o.orderId}`), { status });
    notify(`Order marked ${status}`);
  }

  function openDeliver(o: OrderRow) {
    setDeliverFor(o);
    setDeliverLines((o.items || []).map((_, idx) => o.delivered?.[idx]?.content ?? ""));
    setDeliverNote(o.deliveryNote ?? "");
  }

  async function completeDelivery() {
    if (!db || !deliverFor) return;
    const items = deliverFor.items || [];
    const delivered = items
      .map((it, idx) => ({ title: it.title, content: (deliverLines[idx] || "").trim() }))
      .filter((d) => d.content);
    if (!delivered.length && !deliverNote.trim())
      return notify("Add the delivery details the buyer should see");
    setDelivering(true);
    try {
      await update(ref(db, `orders/${deliverFor.orderId}`), {
        delivered,
        deliveryNote: deliverNote.trim(),
        status: "Completed",
        deliveredAt: new Date().toISOString(),
      });
      if (deliverFor.email) {
        sendMail(db, {
          to: deliverFor.email,
          subject: `${config.siteName || "SILENT SELLER"} · Order ${deliverFor.orderId.slice(-6)} delivered`,
          html: emailShell(
            config.siteName || "SILENT SELLER",
            "Your order is delivered 🎉",
            `<p>Thank you for your purchase — your order is complete. Here are your delivery details:</p>
             ${deliveryBlock(delivered)}
             ${deliverNote.trim() ? `<p style="background:#fff8e6;border:1px solid #ffe2a8;border-radius:12px;padding:12px;font-size:14px">${deliverNote.trim()}</p>` : ""}
             <p style="font-size:13px;color:#6b6d85">A PDF and image copy of this delivery receipt is attached to this email.</p>
             <p style="color:#8a8ca3;font-size:12px">Order ID: ${deliverFor.orderId} · Total: $${Number(deliverFor.total || 0).toFixed(2)}</p>`,
            {
              preheader: "Your items are ready",
              badge: "Delivered",
              ctaText: "View my order",
              ctaUrl: `${(config.siteUrl || websiteUrl()).replace(/\/+$/, "")}/orders`,
            },
          ),
          receipt: {
            orderId: deliverFor.orderId,
            siteName: config.siteName || "SILENT SELLER",
            total: Number(deliverFor.total || 0),
            note: deliverNote.trim() || undefined,
            items: delivered,
          },
        }).then((r) => {
          if (!r.ok) notify(`Email not sent: ${r.error}`);
        });
      }
      void notifyTelegramOrder({
        data: {
          orderId: deliverFor.orderId,
          email: deliverFor.email || undefined,
          total: Number(deliverFor.total || 0),
          status: "Completed",
          items: items.map((i) => ({ title: i.title, qty: i.qty })),
          delivered,
          uid: deliverFor.uid,
        },
      }).catch(() => undefined);
      setDeliverFor(null);
      showSuccess("Delivered", "The buyer can now see the delivery details.");
    } finally {
      setDelivering(false);
    }
  }



  async function decideRequest(r: RequestRow, approve: boolean) {
    if (!db) return;
    if (approve) {
      const w = await get(ref(db, `users/${r.uid}/wallet`));
      const current = Number(w.val()) || 0;
      const next = r.type === "Deposit" ? current + Number(r.amount) : current - Number(r.amount);
      if (next < 0) return notify("User has insufficient balance");
      await set(ref(db, `users/${r.uid}/wallet`), next);
      await push(ref(db, `users/${r.uid}/history`), {
        type: r.type,
        amount: r.amount,
        desc: `${r.type} approved`,
        date: new Date().toISOString(),
      });
    }
    await update(ref(db, `requests/${r.id}`), { status: approve ? "Approved" : "Rejected" });
    notify(approve ? "Approved" : "Rejected");
  }

  function deliveryOf(item: { id?: string; title: string }) {
    const p = products.find((x) => x.id === item.id || x.title === item.title);
    return p?.delivery === "auto"
      ? "Auto stock"
      : p?.delivery === "repeat"
        ? "Repeated"
        : "Manual";
  }

  function exportRows(): ExportRow[] {
    const rows: ExportRow[] = [];
    orders.forEach((o) => {
      const items = o.items || [];
      if (!items.length) {
        rows.push({
          orderId: o.orderId,
          date: o.date,
          buyer: o.email || o.uid,
          product: "—",
          delivery: "—",
          amount: Number(o.total) || 0,
          status: o.status,
        });
        return;
      }
      items.forEach((i, idx) => {
        const amount =
          i.price != null
            ? Number(i.price) * Number(i.qty || 1)
            : idx === 0
              ? Number(o.total) || 0
              : 0;
        rows.push({
          orderId: o.orderId,
          date: o.date,
          buyer: o.email || o.uid,
          product: `${i.title} × ${i.qty}`,
          delivery: deliveryOf(i),
          amount,
          status: o.status,
        });
      });
    });
    return rows;
  }

  async function refreshOrders() {
    if (!db) return;
    const s = await get(ref(db, "orders"));
    setOrders(
      (Object.values(s.val() || {}) as OrderRow[]).sort((a, b) => (a.date < b.date ? 1 : -1)),
    );
    notify("Dashboard refreshed");
  }

  return (
    <Suspense fallback={<div className="fade-in p-6 text-sm text-muted-foreground">Loading…</div>}>
    <div className="fade-in">
      <h1 className="mb-4 text-2xl font-black">Admin panel</h1>
      <div className="mb-3 grid grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-1">
        {(Object.keys(SECTIONS) as Section[]).map((s) => (
          <button
            key={s}
            onClick={() => {
              setSection(s);
              setTab(SECTIONS[s][0]);
            }}
            className={`rounded-xl py-2.5 text-sm font-black transition ${
              section === s ? "btn-grad" : "text-muted-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">
        {SECTIONS[section].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold ${
              tab === t ? "bg-foreground text-background" : "bg-card shadow-sm"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Dashboard" ? (
        <Dashboard orders={orders} products={products} config={config} onRefresh={refreshOrders} />
      ) : null}

      {tab === "Orders" ? (
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => exportOrdersCsv(exportRows(), `orders-${Date.now()}.csv`)}
              className="flex-1 rounded-xl bg-card py-2.5 text-xs font-bold shadow-sm"
            >
              ⬇ Download CSV
            </button>
            <button
              onClick={async () => {
                await exportOrdersPdf(
                  exportRows(),
                  `${config.siteName || "Store"} — orders report`,
                  `orders-${Date.now()}.pdf`,
                );
              }}
              className="flex-1 rounded-xl bg-card py-2.5 text-xs font-bold shadow-sm"
            >
              ⬇ Download PDF
            </button>
          </div>

          {orders.map((o) => (
            <div key={o.orderId} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex justify-between text-xs font-bold">
                <span>#{o.orderId.slice(-6)}</span>
                <span>{o.status}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {o.email} · {o.phone}
              </p>
              <ul className="my-2 text-sm">
                {(o.items || []).map((i, idx) => (
                  <li key={idx}>
                    {i.title} × {i.qty}
                  </li>
                ))}
              </ul>
              <p className="text-lg font-black">${o.total}</p>
              {o.delivered?.length ? (
                <div className="mt-2 space-y-1 rounded-xl bg-muted/60 p-2 text-[11px]">
                  {o.delivered.map((d, idx) => (
                    <p key={idx} className="break-all">
                      <b>{d.title}:</b> {d.content}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => openDeliver(o)}
                  className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white"
                >
                  {o.status === "Completed" ? "Edit delivery" : "Complete delivery"}
                </button>
                <button
                  onClick={() => setOrderStatus(o, "Cancelled")}
                  className="flex-1 rounded-lg bg-destructive py-2 text-xs font-bold text-destructive-foreground"
                >
                  Cancel
                </button>
              </div>

              {deliverFor?.orderId === o.orderId ? (
                <div className="mt-3 space-y-2 rounded-xl border border-border p-3">
                  <p className="text-xs font-black">Delivery details</p>
                  {(o.items || []).map((i, idx) => (
                    <div key={idx}>
                      <label className="mb-1 block text-[11px] font-bold text-muted-foreground">
                        {i.title} × {i.qty}
                      </label>
                      <textarea
                        className={input}
                        rows={2}
                        placeholder="Account, code or link the buyer will see"
                        value={deliverLines[idx] ?? ""}
                        onChange={(e) => {
                          const next = [...deliverLines];
                          next[idx] = e.target.value;
                          setDeliverLines(next);
                        }}
                      />
                    </div>
                  ))}
                  <textarea
                    className={input}
                    rows={2}
                    placeholder="Note for the buyer (optional)"
                    value={deliverNote}
                    onChange={(e) => setDeliverNote(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={delivering}
                      onClick={completeDelivery}
                      className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {delivering ? "Sending…" : "Mark delivered & notify buyer"}
                    </button>
                    <button
                      onClick={() => setDeliverFor(null)}
                      className="rounded-lg bg-muted px-3 py-2 text-xs font-bold"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}

          {orders.length === 0 ? <Empty text="No orders yet." /> : null}
        </div>
      ) : null}

      {tab === "Requests" ? (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex justify-between text-xs font-bold">
                <span>
                  {r.type} · ${r.amount}
                </span>
                <span>{r.status}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.name} · {r.email}
              </p>
              <p className="text-xs text-muted-foreground">{r.utr || r.upi}</p>
              {r.status === "Pending" ? (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => decideRequest(r, true)}
                    className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decideRequest(r, false)}
                    className="flex-1 rounded-lg bg-destructive py-2 text-xs font-bold text-destructive-foreground"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {requests.length === 0 ? <Empty text="No wallet requests." /> : null}
        </div>
      ) : null}

      {tab === "Products" ? <ProductsAdmin products={products} /> : null}

      {tab === "API shops" ? <ProvidersAdmin products={products} /> : null}

      {tab === "Coupons" ? (
        <CouponsAdmin
          coupons={coupons}
          onDone={() => showSuccess("Saved", "Coupon updated successfully.")}
        />
      ) : null}

      {tab === "Users" ? <UsersAdmin /> : null}

      {tab === "Bot buttons" ? <ButtonsAdmin /> : null}

      {tab === "Hosting" ? <RailwayAdmin /> : null}

      {tab === "Settings" ? <SettingsAdmin config={config} banner={banner} /> : null}

    </div>
    </Suspense>
  );
}

