import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { UsersAdmin } from "@/components/admin/UsersAdmin";
export const Route = createFileRoute("/admin/users")({ head: () => ({ meta: [
  { title: "Users — SILENT SELLER" }, { name: "description", content: "Manage store customers, balances and admin access." },
  { property: "og:title", content: "Users — SILENT SELLER" }, { property: "og:description", content: "Manage store customers, balances and admin access." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
] }), component: () => <AdminPageShell title="Users" description="Manage customers, balances and access."><UsersAdmin /></AdminPageShell> });