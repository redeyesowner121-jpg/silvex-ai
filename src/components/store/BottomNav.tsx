import { Link } from "@tanstack/react-router";
import { House, PackageCheck, ShoppingBag, ShoppingCart, UserRound } from "lucide-react";
import { useStore } from "@/context/StoreContext";

const items = [
  { to: "/", label: "Home", icon: House },
  { to: "/products", label: "Shop", icon: ShoppingBag },
  { to: "/cart", label: "Cart", icon: ShoppingCart },
  { to: "/orders", label: "Orders", icon: PackageCheck },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

export function BottomNav() {
  const { cartCount } = useStore();

  return (
    <nav className="fixed bottom-0 left-0 z-40 w-full border-t border-border bg-card">
      <div className="mx-auto flex w-full max-w-md items-stretch justify-between px-2 py-2 md:max-w-2xl">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "text-primary" }}
              activeOptions={{ exact: item.to === "/" }}
              className="relative flex flex-1 flex-col items-center gap-0.5 py-1 text-[10px] font-bold text-muted-foreground"
            >
              <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={2.2} />
              {item.label}
              {item.to === "/cart" && cartCount > 0 ? (
                <span className="absolute right-3 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] text-destructive-foreground">
                  {cartCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
