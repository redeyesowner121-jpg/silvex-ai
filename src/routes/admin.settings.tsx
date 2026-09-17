import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { SettingsAdmin } from "@/components/admin/SettingsAdmin";
import { useStore } from "@/context/StoreContext";
export const Route = createFileRoute("/admin/settings")({ head: () => ({ meta: [
  { title: "Settings — SILENT SELLER" }, { name: "description", content: "Manage store, payment, email and Telegram settings." },
  { property: "og:title", content: "Settings — SILENT SELLER" }, { property: "og:description", content: "Manage store, payment, email and Telegram settings." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
] }), component: SettingsPage });
function SettingsPage() { const { config, banner } = useStore(); return <AdminPageShell title="Settings" description="Manage store, payments, email and Telegram."><SettingsAdmin config={config} banner={banner} /></AdminPageShell>; }