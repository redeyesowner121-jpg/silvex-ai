import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { CouponsAdmin } from "@/components/admin/CouponsAdmin";
import { useStore } from "@/context/StoreContext";

type Coupon = { code: string; type: string; value: number };
export const Route = createFileRoute("/admin/coupons")({
  head: () => ({ meta: [
    { title: "Coupons — SILENT SELLER" }, { name: "description", content: "Create and manage store discount coupons." },
    { property: "og:title", content: "Coupons — SILENT SELLER" }, { property: "og:description", content: "Create and manage store discount coupons." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }), component: CouponsPage,
});
function CouponsPage() {
  const { db, showSuccess } = useStore(); const [coupons, setCoupons] = useState<Coupon[]>([]);
  useEffect(() => { if (!db) return; return onValue(ref(db, "coupons"), (snapshot) => setCoupons(Object.entries(snapshot.val() || {}).map(([code, coupon]) => ({ code, ...(coupon as Omit<Coupon, "code">) })))); }, [db]);
  return <AdminPageShell title="Coupons" description="Create discount codes and manage usage limits."><CouponsAdmin coupons={coupons} onDone={() => showSuccess("Saved", "Coupon updated successfully.")} /></AdminPageShell>;
}