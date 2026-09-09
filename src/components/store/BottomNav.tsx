import { Link } from "@tanstack/react-router";
import { useStore } from "@/context/StoreContext";
import { Emo } from "@/components/store/Emo";

const items = [
  { to: "/", label: "Home", key: "web.home" },
  { to: "/products", label: "Shop", key: "web.shop" },
  { to: "/cart", label: "Cart", key: "web.cart" },
  { to: "/orders", label: "Orders", key: "web.orders" },
  { to: "/profile", label: "Profile", key: "web.profile" },
] as const;

export function BottomNav() {
  const { cartCount } = useStore();

  return (
    <nav className="fixed bottom-0 left-0 z-40 w-full border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-md items-stretch justify-between px-2 py-2 md:max-w-2xl">
        {items.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeProps={{ className: "text-primary" }}
            activeOptions={{ exact: item.to === "/" }}
            className="relative flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-bold text-muted-foreground"
          >
            <span className="text-lg leading-none"><Emo k={item.key} /></span>
            {item.label}
            {item.to === "/cart" && cartCount > 0 ? (
              <span className="absolute right-3 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] text-destructive-foreground">
                {cartCount}
              </span>
            ) : null}
          </Link>
        ))}
      </div>
    </nav>
  );
}
