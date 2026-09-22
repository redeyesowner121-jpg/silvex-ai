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
    <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-border/30 bg-background">
      <div className="mx-auto flex w-full max-w-md items-center justify-around px-2 py-2 md:max-w-2xl">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="group relative flex min-w-[56px] flex-col items-center justify-center rounded-2xl px-4 py-1.5 text-[10px] font-semibold text-muted-foreground transition-all duration-200 active:scale-90"
              activeProps={{ className: "text-primary-foreground -translate-y-0.5" }}
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <span className="gradient-primary shadow-colored-primary absolute inset-0 rounded-2xl" aria-hidden="true" />
                  ) : null}
                  <span className="relative z-10">
                    <Icon
                      aria-hidden="true"
                      strokeWidth={2.2}
                      className={`h-5 w-5 transition-transform duration-200 ${isActive ? "scale-110" : ""}`}
                    />
                    {item.to === "/cart" && cartCount > 0 ? (
                      <span className="gradient-accent shadow-colored-accent absolute -right-3 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold text-accent-foreground">
                        {cartCount > 9 ? "9+" : cartCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="relative z-10 mt-0.5">{item.label}</span>
                </>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
