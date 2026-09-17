import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { get, onValue, ref } from "firebase/database";
import { Dashboard } from "@/components/admin/Dashboard";
import { ManagementHub } from "@/components/admin/ManagementHub";
import { OrdersAdmin } from "@/components/admin/OrdersAdmin";
import { useStore } from "@/context/StoreContext";
import type { OrderRow } from "@/components/admin/shared";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [
    { title: "Admin Panel — SILENT SELLER" },
    { name: "description", content: "Store analysis and management tools for SILENT SELLER admins." },
    { property: "og:title", content: "Admin Panel — SILENT SELLER" },
    { property: "og:description", content: "Store analysis and management tools for SILENT SELLER admins." },
    { property: "og:type", content: "website" },
    { name: "robots", content: "noindex" },
    { name: "twitter:card", content: "summary" },
  ] }),
  validateSearch: (search: Record<string, unknown>): { view: "analysis" | "orders" | "management" } => ({ view: search["view"] === "management" || search["view"] === "orders" ? search["view"] : "analysis" }),
  component: AdminHome,
});

function AdminHome() {
  const { view } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { db, products, config, notify } = useStore();
  const [orders, setOrders] = useState<OrderRow[]>([]);

  useEffect(() => {
    if (!db) return;
    return onValue(ref(db, "orders"), (snapshot) => setOrders(
      (Object.values(snapshot.val() || {}) as OrderRow[]).sort((a, b) => (a.date < b.date ? 1 : -1)),
    ));
  }, [db]);

  async function refresh() {
    if (!db) return;
    const snapshot = await get(ref(db, "orders"));
    setOrders((Object.values(snapshot.val() || {}) as OrderRow[]).sort((a, b) => (a.date < b.date ? 1 : -1)));
    notify("Dashboard refreshed");
  }

  return (
    <div className="fade-in mx-auto max-w-4xl">
      <h1 className="mb-4 text-2xl font-black">Admin panel</h1>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-muted/60 p-1">
        <button onClick={() => navigate({ search: { view: "analysis" }, replace: true })} className={`rounded-xl py-2.5 text-sm font-black transition ${view !== "management" ? "btn-grad" : "text-muted-foreground"}`}>Analysis</button>
        <button onClick={() => navigate({ search: { view: "management" }, replace: true })} className={`rounded-xl py-2.5 text-sm font-black transition ${view === "management" ? "btn-grad" : "text-muted-foreground"}`}>Management</button>
      </div>
      {view !== "management" ? <div className="mb-5 grid grid-cols-2 gap-2"><button onClick={() => navigate({ search: { view: "analysis" }, replace: true })} className={`rounded-xl px-4 py-2 text-xs font-bold ${view === "analysis" ? "bg-foreground text-background" : "bg-card shadow-sm"}`}>Dashboard</button><button onClick={() => navigate({ search: { view: "orders" }, replace: true })} className={`rounded-xl px-4 py-2 text-xs font-bold ${view === "orders" ? "bg-foreground text-background" : "bg-card shadow-sm"}`}>Orders</button></div> : null}
      {view === "management" ? <ManagementHub /> : view === "orders" ? <OrdersAdmin orders={orders} /> : <Dashboard orders={orders} products={products} config={config} onRefresh={refresh} />}
    </div>
  );
}