import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { useStore } from "@/context/StoreContext";
import { ProductCard } from "@/components/store/ProductCard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RKR Premium Store — Digital Products at Cheapest Rates" },
      {
        name: "description",
        content:
          "Buy premium subscriptions, digital services and earning methods at the cheapest rates with instant delivery and wallet payments.",
      },
      { property: "og:title", content: "RKR Premium Store — Digital Products" },
      {
        property: "og:description",
        content: "Cheapest rates, instant delivery and wallet payments.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});




function useCountdown(endTime?: number) {
  const [left, setLeft] = useState("00:00:00");
  useEffect(() => {
    if (!endTime) return;
    const tick = () => {
      const diff = endTime - Date.now();
      if (diff <= 0) return setLeft("00:00:00");
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setLeft([h, m, s].map((n) => String(n).padStart(2, "0")).join(":"));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endTime]);
  return left;
}

function Home() {
  const { products, config, banner, flashSale, categories, addToCart } = useStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const saleActive = Boolean(flashSale?.endTime && flashSale.endTime > Date.now());
  const saleProduct = products.find((p) => p.id === flashSale?.pid);
  const countdown = useCountdown(flashSale?.endTime);


  const trending = [...products]
    .sort((a, b) => (b.salesCount ?? 0) - (a.salesCount ?? 0))
    .slice(0, 6);

  return (
    <div className="fade-in">
      <div className="mb-5 overflow-hidden rounded-xl bg-card px-3 py-2 text-xs font-medium text-muted-foreground shadow-sm">
        <div className="marquee whitespace-nowrap">
          {config.marquee || "Welcome to RKR Premium Store! 🔥 Get the best deals here."}
        </div>
      </div>


      <div className="mb-6 rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 p-6 text-white shadow-lg">
        <p className="text-[10px] font-bold uppercase tracking-widest opacity-80">RKR Premium</p>
        <h1 className="mt-2 text-3xl font-black leading-tight">{banner.title || "Digital Store"}</h1>
        <p className="mt-1 text-xs opacity-90">
          {banner.desc || "Cheapest rates & instant delivery"}
        </p>
        <button
          onClick={() => navigate({ to: "/products" })}
          className="mt-4 rounded-xl bg-white px-5 py-2 text-xs font-bold text-indigo-700"
        >
          Shop now
        </button>
      </div>

      {saleActive && saleProduct ? (
        <div className="mb-6 rounded-2xl border border-destructive/20 bg-card p-4 shadow-lg">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-black text-destructive">⚡ FLASH SALE</span>
            <span className="rounded bg-destructive/10 px-2 py-1 font-mono text-xs font-bold text-destructive">
              {countdown}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="line-clamp-1 text-sm font-bold">{saleProduct.title}</h3>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-xl font-black">${flashSale?.price}</span>
                <span className="text-xs text-muted-foreground line-through">
                  ${saleProduct.price}
                </span>
              </div>
            </div>
            <button
              onClick={() => addToCart(saleProduct, Number(flashSale?.price))}
              className="rounded-xl bg-destructive px-5 py-2 text-xs font-bold text-destructive-foreground"
            >
              BUY
            </button>
          </div>
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ to: "/products", search: { q: search } });
        }}
        className="mb-6 flex items-center gap-2 rounded-xl bg-card p-3 shadow-sm"
      >
        <span>🔍</span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products..."
          className="w-full bg-transparent text-sm outline-none"
        />
      </form>

      <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-muted-foreground">
        Categories
      </h2>
      <div className="mb-6 grid grid-cols-4 gap-3">
        {categories.map((c) => (
          <button
            key={c.label}
            onClick={() => navigate({ to: "/products", search: { category: c.label } })}
            className="flex flex-col items-center gap-1 rounded-2xl bg-card p-3 text-[11px] font-bold shadow-sm"
          >
            <span className="text-xl">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-muted-foreground">
        Trending
      </h2>
      {products.length === 0 ? (
        <p className="rounded-2xl bg-card p-6 text-center text-xs text-muted-foreground shadow-sm">
          No products yet. An admin can add them from the admin panel.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {trending.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
