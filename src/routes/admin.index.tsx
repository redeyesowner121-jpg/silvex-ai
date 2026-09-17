import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { get, onValue, ref } from "firebase/database";
import { Dashboard } from "@/components/admin/Dashboard";
import { ManagementHub } from "@/components/admin/ManagementHub";
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
  validateSearch: (search: Record<string, unknown>): { view?: "management" } => search["view"] === "management" ? { view: "management" } : {},
  component: AdminHome,
});

function AdminHome() {
  const { view: requestedView } = Route.useSearch();
  const view = requestedView ?? "analysis";
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
        {(["analysis", "management"] as const).map((item) => <button key={item} onClick={() => navigate({ search: item === "management" ? { view: "management" } : {}, replace: true })} className={`rounded-xl py-2.5 text-sm font-black capitalize transition ${view === item ? "btn-grad" : "text-muted-foreground"}`}>{item}</button>)}
      </div>
      {view === "management" ? <ManagementHub /> : <Dashboard orders={orders} products={products} config={config} onRefresh={refresh} />}
    </div>
  );
}