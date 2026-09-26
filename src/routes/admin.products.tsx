import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { ProductsList } from "@/components/admin/ProductsList";
import { useStore } from "@/context/StoreContext";

export const Route = createFileRoute("/admin/products")({
  head: () => ({ meta: [
    { title: "Products — SILENT SELLER" }, { name: "description", content: "Manage products, prices, delivery and stock." },
    { property: "og:title", content: "Products — SILENT SELLER" }, { property: "og:description", content: "Manage products, prices, delivery and stock." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }), component: ProductsPage,
});
function ProductsPage() { const { products } = useStore(); return <AdminPageShell title="Products" description="All products — price, commission and stock."><ProductsList products={products} /></AdminPageShell>; }