import { Bot, Boxes, Cloud, Plug, Settings, TicketPercent, Users, WalletCards } from "lucide-react";
import { Link } from "@tanstack/react-router";

const items = [
  { to: "/admin/requests", label: "Requests", detail: "Deposits and withdrawals", icon: WalletCards },
  { to: "/admin/products", label: "Products", detail: "Products, prices and stock", icon: Boxes },
  { to: "/admin/api-shops", label: "API shops", detail: "Suppliers and imported items", icon: Plug },
  { to: "/admin/coupons", label: "Coupons", detail: "Discount codes and limits", icon: TicketPercent },
  { to: "/admin/users", label: "Users", detail: "Customers and access", icon: Users },
  { to: "/admin/bot-buttons", label: "Bot buttons", detail: "Telegram button colours", icon: Bot },
  { to: "/admin/hosting", label: "Hosting", detail: "Railway deployment", icon: Cloud },
  { to: "/admin/settings", label: "Settings", detail: "Store, payments and bot", icon: Settings },
] as const;

export function ManagementHub() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ to, label, detail, icon: Icon }) => (
        <Link key={to} to={to} className="group flex min-h-36 min-w-0 flex-col justify-between rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/50 hover:shadow-md">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black">{label}</span>
            <span className="mt-1 block text-xs leading-4 text-muted-foreground">{detail}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}