import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { useStore } from "@/context/StoreContext";

export const Route = createFileRoute("/history")({
  head: () => ({
    meta: [
      { title: "Wallet History — SILENT SELLER" },
      {
        name: "description",
        content: "See every deposit, purchase and refund made with your wallet.",
      },
      { property: "og:title", content: "Wallet History — SILENT SELLER" },
      {
        property: "og:description",
        content: "See every deposit, purchase and refund made with your wallet.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

type Entry = { id: string; type: string; amount: number; desc: string; date: string };

function HistoryPage() {
  const { db, user, wallet, openModal } = useStore();
  const [items, setItems] = useState<Entry[]>([]);

  useEffect(() => {
    if (!db || !user) return;
    return onValue(ref(db, `users/${user.uid}/history`), (s) => {
      const val = (s.val() || {}) as Record<string, Omit<Entry, "id">>;
      setItems(
        Object.entries(val)
          .map(([id, h]) => ({ id, ...h }))
          .sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))),
      );
    });
  }, [db, user]);

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-16 text-center md:max-w-3xl">
        <h1 className="mb-2 text-xl font-bold">Wallet history</h1>
        <p className="mb-6 text-sm text-muted-foreground">Log in to see your transactions.</p>
        <button
          onClick={() => openModal("auth")}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-5 md:max-w-3xl">
      <h1 className="mb-1 text-xl font-bold">Wallet history</h1>
      <p className="mb-4 text-xs text-muted-foreground">
        Current balance: <span className="font-bold text-foreground">${wallet}</span>
      </p>

      {items.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No transactions yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
            >
              <div className="min-w-0">
                <p className="text-xs font-bold">{h.type}</p>
                {h.desc ? (
                  <p className="truncate text-[11px] text-muted-foreground">{h.desc}</p>
                ) : null}
                <p className="text-[10px] text-muted-foreground">
                  {h.date ? new Date(h.date).toLocaleString() : ""}
                </p>
              </div>
              <span className="shrink-0 text-sm font-black">${h.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
