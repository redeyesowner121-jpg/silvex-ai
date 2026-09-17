import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { RailwayAdmin } from "@/components/admin/RailwayAdmin";
export const Route = createFileRoute("/admin/hosting")({ head: () => ({ meta: [
  { title: "Hosting — SILENT SELLER" }, { name: "description", content: "Manage Railway hosting and deployment status." },
  { property: "og:title", content: "Hosting — SILENT SELLER" }, { property: "og:description", content: "Manage Railway hosting and deployment status." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
] }), component: () => <AdminPageShell title="Hosting" description="Manage the Railway deployment and live address."><RailwayAdmin /></AdminPageShell> });