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
      <h1 className="font-display mb-1 flex items-center gap-2 text-2xl font-black">
        <Shield className="h-6 w-6 text-primary" /> Admin panel
      </h1>
      <p className="mb-5 text-sm text-muted-foreground">Overview, reports and full store control.</p>
      <div className="mb-6 grid grid-cols-2 gap-4">
        <button
          onClick={() => navigate({ search: { view: "analysis" }, replace: true })}
          className={`relative overflow-hidden rounded-3xl p-5 text-left transition-all active:scale-[0.98] ${view !== "management" ? "gradient-primary shadow-colored-primary text-primary-foreground" : "border border-border bg-card hover:border-primary/50 hover:shadow-md"}`}
        >
          <span className="flex flex-col items-center gap-3">
            <span className={`grid h-14 w-14 place-items-center rounded-2xl ${view !== "management" ? "bg-white/20" : "bg-primary/10 text-primary"}`}>
              <TrendingUp className="h-7 w-7" />
            </span>
            <span className="text-center">
              <span className="font-display block text-lg font-bold">Analysis</span>
              <span className={`mt-0.5 block text-xs ${view !== "management" ? "text-primary-foreground/75" : "text-muted-foreground"}`}>Overview & reports</span>
            </span>
          </span>
        </button>
        <button
          onClick={() => navigate({ search: { view: "management" }, replace: true })}
          className={`relative overflow-hidden rounded-3xl p-5 text-left transition-all active:scale-[0.98] ${view === "management" ? "gradient-sunset shadow-colored-secondary text-secondary-foreground" : "border border-border bg-card hover:border-secondary/50 hover:shadow-md"}`}
        >
          <span className="flex flex-col items-center gap-3">
            <span className={`grid h-14 w-14 place-items-center rounded-2xl ${view === "management" ? "bg-white/20" : "bg-secondary/10 text-secondary"}`}>
              <Shield className="h-7 w-7" />
            </span>
            <span className="text-center">
              <span className="font-display block text-lg font-bold">Management</span>
              <span className={`mt-0.5 block text-xs ${view === "management" ? "text-secondary-foreground/75" : "text-muted-foreground"}`}>Manage everything</span>
            </span>
          </span>
        </button>
      </div>
      {view !== "management" ? <div className="mb-5 grid grid-cols-2 gap-2"><button onClick={() => navigate({ search: { view: "analysis" }, replace: true })} className={`rounded-xl px-4 py-2 text-xs font-bold ${view === "analysis" ? "bg-foreground text-background" : "bg-card shadow-sm"}`}>Dashboard</button><button onClick={() => navigate({ search: { view: "orders" }, replace: true })} className={`rounded-xl px-4 py-2 text-xs font-bold ${view === "orders" ? "bg-foreground text-background" : "bg-card shadow-sm"}`}>Orders</button></div> : null}
      {view === "management" ? <ManagementHub /> : view === "orders" ? <OrdersAdmin orders={orders} /> : <Dashboard orders={orders} products={products} config={config} onRefresh={refresh} />}
    </div>
  );
}