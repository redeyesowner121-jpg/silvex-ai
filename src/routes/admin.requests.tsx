import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { RequestsAdmin } from "@/components/admin/RequestsAdmin";

export const Route = createFileRoute("/admin/requests")({
  head: () => ({ meta: [
    { title: "Wallet Requests — SILENT SELLER" },
    { name: "description", content: "Review store wallet deposit and withdrawal requests." },
    { property: "og:title", content: "Wallet Requests — SILENT SELLER" },
    { property: "og:description", content: "Review store wallet deposit and withdrawal requests." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: () => <AdminPageShell title="Requests" description="Review deposits and withdrawals."><RequestsAdmin /></AdminPageShell>,
});