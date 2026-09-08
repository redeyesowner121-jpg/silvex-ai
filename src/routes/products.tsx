import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useStore } from "@/context/StoreContext";
import { ProductCard } from "@/components/store/ProductCard";

type ProductSearch = { q?: string | undefined; category?: string | undefined };

export const Route = createFileRoute("/products")({
  validateSearch: (search: Record<string, unknown>): ProductSearch => ({
    q: typeof search["q"] === "string" ? search["q"] : "",
    category: typeof search["category"] === "string" ? search["category"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Shop Digital Products — RKR Premium Store" },
      {
        name: "description",
        content:
          "Browse premium subscriptions, services, methods and free digital products with instant delivery.",
      },
      { property: "og:title", content: "Shop Digital Products — RKR Premium Store" },
      {
        property: "og:description",
        content: "Browse premium subscriptions, services, methods and free digital products.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Products,
});

function Products() {
  const { q, category } = Route.useSearch();
  const { products } = useStore();
  const [filter, setFilter] = useState(q ?? "");

  const list = products.filter((p) => {
    const matchesText = p.title.toLowerCase().includes(filter.toLowerCase());
    const matchesCat = !category || p.type === category;
    return matchesText && matchesCat;
  });

  return (
    <div className="fade-in">
      <h1 className="mb-4 text-2xl font-black">{category || "All products"}</h1>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter items..."
        className="mb-4 w-full rounded-xl border border-border bg-card p-3 text-sm shadow-sm outline-none"
      />
      {list.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-xs text-muted-foreground shadow-sm">
          Nothing found here yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 pb-10">
          {list.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
