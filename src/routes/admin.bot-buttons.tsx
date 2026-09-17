import { createFileRoute } from "@tanstack/react-router";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { ButtonsAdmin } from "@/components/admin/ButtonsAdmin";
export const Route = createFileRoute("/admin/bot-buttons")({ head: () => ({ meta: [
  { title: "Bot Buttons — SILENT SELLER" }, { name: "description", content: "Customize Telegram bot button colours." },
  { property: "og:title", content: "Bot Buttons — SILENT SELLER" }, { property: "og:description", content: "Customize Telegram bot button colours." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
] }), component: () => <AdminPageShell title="Bot buttons" description="Customize every Telegram bot button colour."><ButtonsAdmin /></AdminPageShell> });