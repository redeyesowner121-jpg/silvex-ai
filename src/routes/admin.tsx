import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useStore } from "@/context/StoreContext";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const { ready, user, isAdmin } = useStore();
  if (!ready) return <p className="py-20 text-center text-sm text-muted-foreground">Loading…</p>;
  if (!user || !isAdmin) return <div className="rounded-2xl bg-card p-8 text-center shadow-sm"><h1 className="text-lg font-black">Admin only</h1><p className="mt-2 text-sm text-muted-foreground">Sign in with an admin account to open this area.</p></div>;
  return <Outlet />;
}