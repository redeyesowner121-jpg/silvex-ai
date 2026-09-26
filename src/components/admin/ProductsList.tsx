import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Pencil, Plus, Search } from "lucide-react";
import { input } from "@/components/admin/shared";
import type { Product } from "@/context/StoreContext";

export function ProductsList({ products }: { products: Product[] }) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const list = products
    .filter((p) => `${p.title} ${p.type || ""}`.toLowerCase().includes(q))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${input} pl-9`}
            type="search"
            placeholder="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Link
          to="/admin/edit/$productId"
          params={{ productId: "new" }}
          className="btn-grad flex shrink-0 items-center gap-1.5 rounded-xl px-4 text-sm font-bold"
        >
          <Plus className="h-4 w-4" /> Add
        </Link>
      </div>

      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {list.map((p) => {
          const isApi = p.delivery === "supplier";
          const stock = isApi ? p.supplierStock ?? 0 : (p.stock || []).filter(Boolean).length;
          return (
            <div key={p.id} className="flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{p.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  ${p.price}
                  {isApi ? <> · Commission {p.markup ?? 130}%</> : null}
                  {p.delivery === "auto" || isApi ? <> · Stock {stock}</> : null}
                  {p.soldOut ? (
                    <span className="ml-2 font-bold text-destructive">Out of stock</span>
                  ) : null}
                </p>
              </div>
              <Link
                to="/admin/edit/$productId"
                params={{ productId: p.id }}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
            </div>
          );
        })}
        {!list.length ? (
          <p className="p-6 text-center text-sm text-muted-foreground">No products found.</p>
        ) : null}
      </div>
    </div>
  );
}
