import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { ProvidersAdmin } from "@/components/admin/ProvidersAdmin";
import { useStore } from "@/context/StoreContext";

export const Route = createFileRoute("/admin/api-shops")({
  head: () => ({ meta: [
    { title: "API Shops — SILENT SELLER" }, { name: "description", content: "Manage supplier shops and imported API products." },
    { property: "og:title", content: "API Shops — SILENT SELLER" }, { property: "og:description", content: "Manage supplier shops and imported API products." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }), component: ApiShopsPage,
});
function ApiShopsPage() { const { products } = useStore(); return <AdminPageShell title="API shops" description="Connect suppliers and control imported products."><ProvidersAdmin products={products} /></AdminPageShell>; }