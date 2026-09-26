import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, KeyRound } from "lucide-react";
import { groupSlug, useStore, type Product } from "@/context/StoreContext";
import { FolderCard, ProductCard } from "@/components/store/ProductCard";
import { websiteUrl } from "@/lib/referral";
import { downloadTextFile, resellerApiDocs } from "@/lib/reseller-docs";

type ProductSearch = { q?: string | undefined; category?: string | undefined; group?: string | undefined };

export const Route = createFileRoute("/products")({
  validateSearch: (search: Record<string, unknown>): ProductSearch => ({
    q: typeof search["q"] === "string" ? search["q"] : "",
    category: typeof search["category"] === "string" ? search["category"] : "",
    group: typeof search["group"] === "string" ? search["group"] : "",
  }),
  head: () => ({
    meta: [
      { title: "Shop Digital Products — SILENT SELLER" },
      {
        name: "description",
        content:
          "Browse premium subscriptions, services, methods and free digital products with instant delivery.",
      },
      { property: "og:title", content: "Shop Digital Products — SILENT SELLER" },
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
  const { q, category, group } = Route.useSearch();
  const { products, profile, config, notify } = useStore();
  const [filter, setFilter] = useState(q ?? "");
  const normalizedFilter = filter.trim().toLowerCase();
  const showApiDocs = normalizedFilter === "api" || normalizedFilter.includes("reseller api") || normalizedFilter.includes("api docs");
  const apiKey = (profile as { apiKey?: string } | null)?.apiKey;
  const base = `${(config.siteUrl || websiteUrl()).replace(/\/+$/, "")}/api/public/reseller`;

  const list = useMemo(() => {
    const normalizedFilter = filter.toLowerCase();
    return products.filter((p) => {
      if (p.hidden || p.hideWeb) return false;
      if (group && groupSlug(p.group || "") !== group) return false;
      const matchesText = p.title.toLowerCase().includes(normalizedFilter);
      const matchesCat = !category || p.type === category;
      return matchesText && matchesCat;
    });
  }, [products, filter, category, group]);

  // Products sharing a folder name collapse into a single card unless a folder is open.
  const { singles, folders } = useMemo(() => {
    if (group) return { singles: list, folders: [] as { name: string; slug: string; items: Product[] }[] };
    const map = new Map<string, { name: string; slug: string; items: Product[] }>();
    const rest: Product[] = [];
    for (const p of list) {
      const name = String(p.group || "").trim();
      if (!name) {
        rest.push(p);
        continue;
      }
      const slug = groupSlug(name);
      const existing = map.get(slug);
      if (existing) existing.items.push(p);
      else map.set(slug, { name, slug, items: [p] });
    }
    return { singles: rest, folders: [...map.values()] };
  }, [list, group]);

  const openFolderName = group ? list[0]?.group || "Plans" : "";

  return (
    <div className="fade-in">
      {group ? (
        <Link to="/products" search={{ group: "" }} className="mb-2 inline-block text-xs font-bold text-muted-foreground">
          ← All products
        </Link>
      ) : null}
      <h1 className="mb-4 text-2xl font-black">{group ? openFolderName : category || "All products"}</h1>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter items..."
        className="mb-4 w-full rounded-xl border border-border bg-card p-3 text-sm shadow-sm outline-none"
      />
      {showApiDocs ? (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <KeyRound className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold">Reseller API documentation</h2>
            <p className="text-xs text-muted-foreground">Endpoints, authentication, ordering, delivery, and examples.</p>
          </div>
          {apiKey ? (
            <button
              type="button"
              aria-label="Download reseller API documentation"
              title="Download API documentation"
              onClick={() => {
                downloadTextFile("silent-seller-reseller-api.txt", resellerApiDocs(base, apiKey));
                notify("API documentation downloaded");
              }}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <Link to="/api-key" className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
              Get file
            </Link>
          )}
        </div>
      ) : null}
      {list.length === 0 && !showApiDocs ? (
        <p className="rounded-2xl bg-card p-6 text-center text-xs text-muted-foreground shadow-sm">
          Nothing found here yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 pb-10 md:grid-cols-4">
          {folders.map((f) => (
            <FolderCard key={f.slug} name={f.name} slug={f.slug} items={f.items} />
          ))}
          {singles.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
