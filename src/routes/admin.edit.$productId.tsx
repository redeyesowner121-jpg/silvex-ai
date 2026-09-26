import { createFileRoute, Link } from "@tanstack/react-router";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { useStore } from "@/context/StoreContext";

export const Route = createFileRoute("/admin/edit/$productId")({
  head: () => ({ meta: [
    { title: "Edit Product — SILENT SELLER" },
    { name: "description", content: "Edit product details, delivery, pricing and stock." },
    { property: "og:title", content: "Edit Product — SILENT SELLER" },
    { property: "og:description", content: "Edit product details, delivery, pricing and stock." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: EditProductPage,
});

function EditProductPage() {
  const { productId } = Route.useParams();
  const { products, ready, user, isAdmin } = useStore();
  if (!ready) return <p className="py-20 text-center text-sm text-muted-foreground">Loading…</p>;
  if (!user || !isAdmin) return <div className="rounded-2xl bg-card p-8 text-center"><h1 className="text-lg font-black">Admin only</h1><p className="mt-2 text-sm text-muted-foreground">Sign in with an admin account to edit products.</p></div>;
  const product = productId === "new"
    ? { id: "new", title: "", price: 0, delivery: "manual" as const, stock: [] }
    : products.find((item) => item.id === productId);
  if (!product) return <div className="rounded-2xl bg-card p-8 text-center"><h1 className="text-lg font-black">Product not found</h1><Link to="/admin/products" className="mt-4 inline-block text-sm font-bold text-primary">Back to products</Link></div>;
  return <ProductEditor product={product} />;
}