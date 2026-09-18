import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { get, onValue, push, ref, remove, set, update } from "firebase/database";
import { useStore, isOwnerEmail, isFixedOwner, type Product, type Category } from "@/context/StoreContext";
import { fileToCompressedDataUrl } from "@/lib/image-upload";
import { exportOrdersCsv, exportOrdersPdf, type ExportRow } from "@/lib/export-orders";
import { sendSmtpMail } from "@/lib/mail.functions";
import { deliveryBlock, emailShell, sendMail } from "@/lib/mailer";
import { notifyTelegramOrder } from "@/lib/telegram.functions";
import { input, Empty } from "@/components/admin/shared";



type HistoryRow = {
  id: string;
  type?: string;
  amount?: number;
  desc?: string;
  date?: string;
  status?: string;
};

type UserRow = {
  uid: string;
  name?: string;
  email?: string;
  wallet?: number;
  phone?: string;
  isAdmin?: boolean;
  isOwner?: boolean;
  /** true when this row is another owner, shown as a normal user */
  hidden?: boolean;
};



export function UsersAdmin() {
  const { db, user, notify } = useStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  // Live wallet history for whichever user the admin opened.
  useEffect(() => {
    if (!db || !historyFor) {
      setHistory([]);
      return;
    }
    return onValue(ref(db, `users/${historyFor}/history`), (s) => {
      const val = s.val() || {};
      setHistory(
        Object.entries(val)
          .map(([id, h]) => ({ id, ...(h as Omit<HistoryRow, "id">) }))
          .reverse(),
      );
    });
  }, [db, historyFor]);

  useEffect(() => {
    if (!db) return;
    return onValue(ref(db, "users"), (s) =>
      setUsers(
        Object.entries(s.val() || {}).map(([uid, u]) => ({
          uid,
          ...(u as Omit<UserRow, "uid">),
        })),
      ),
    );
  }, [db]);

  // Owners are invisible to each other: another owner looks like a normal user.
  const disguised = users.map((u) => {
    const otherOwner = isOwnerEmail(u.email) && u.uid !== user?.uid;
    return otherOwner ? { ...u, isOwner: false, isAdmin: false, hidden: true } : u;
  });

  const list = disguised.filter((u) =>
    `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  async function setWallet(u: UserRow) {
    if (!db) return;
    const raw = prompt(`New wallet balance for ${u.email}`, String(u.wallet ?? 0));
    if (raw === null) return;
    const amount = Number(raw);
    if (Number.isNaN(amount)) return notify("Enter a number");
    await set(ref(db, `users/${u.uid}/wallet`), amount);
    await push(ref(db, `users/${u.uid}/history`), {
      type: "Adjustment",
      amount,
      desc: "Balance set by admin",
      date: new Date().toISOString(),
    });
    notify("Balance updated");
  }

  return (
    <div className="space-y-3">
      <input
        className={input}
        placeholder="Search name or email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {list.map((u) => (
        <div key={u.uid} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{u.name || "User"}</p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
            </div>
            <span className="text-sm font-black">${u.wallet ?? 0}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setWallet(u)}
              className="rounded-lg bg-muted px-3 py-1.5 text-xs font-bold"
            >
              Set balance
            </button>
            {u.uid === user?.uid ? (
              <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                You
              </span>
            ) : (
              <button
                onClick={async () => {
                  if (!db) return;
                  if (isFixedOwner(u.email)) return notify("This owner cannot be changed");
                  const removing = u.isAdmin || u.hidden;
                  await update(ref(db, `users/${u.uid}`), {
                    isAdmin: !removing,
                    isOwner: removing ? false : u.hidden ? true : false,
                    ownerRevoked: removing,
                  });
                  notify(removing ? "Access removed" : "Admin access granted");
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                  u.isAdmin || u.hidden
                    ? "bg-destructive/10 text-destructive"
                    : "bg-emerald-500/10 text-emerald-600"
                }`}
              >
                {u.isAdmin || u.hidden ? "Remove admin" : "Make admin"}
              </button>
            )}
          </div>
        </div>
      ))}
      {list.length === 0 ? <Empty text="No users found." /> : null}
    </div>
  );
}



