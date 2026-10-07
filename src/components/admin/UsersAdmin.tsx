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



type SortMode = "none" | "deposits" | "wallet" | "orders";

type RawUser = Omit<UserRow, "uid"> & { history?: Record<string, HistoryRow> };

export function UsersAdmin() {
  const { db, user, notify } = useStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("none");
  const [listLimit, setListLimit] = useState(5);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyLimit, setHistoryLimit] = useState(5);
  const [allWalletOpen, setAllWalletOpen] = useState(false);
  const [walletSearch, setWalletSearch] = useState("");
  const [walletLimit, setWalletLimit] = useState(5);

  // Every wallet change across all users, newest first.
  const allWalletRows = users
    .flatMap((u) =>
      Object.entries((u as RawUser).history || {}).map(([id, h]) => ({
        id,
        ...(h as Omit<HistoryRow, "id">),
        userName: u.name || "User",
        userEmail: u.email || "",
      })),
    )
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const walletFiltered = allWalletRows.filter((h) =>
    `${h.userName} ${h.userEmail} ${h.type ?? ""} ${h.desc ?? ""}`
      .toLowerCase()
      .includes(walletSearch.toLowerCase()),
  );

  // Order counts per user, loaded once for the "high orders" filter.
  useEffect(() => {
    if (!db) return;
    get(ref(db, "orders")).then((s) => {
      const counts: Record<string, number> = {};
      Object.values(s.val() || {}).forEach((o) => {
        const uid = (o as { userId?: string; uid?: string }).userId ?? (o as { uid?: string }).uid;
        if (uid) counts[uid] = (counts[uid] ?? 0) + 1;
      });
      setOrderCounts(counts);
    });
  }, [db]);

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

  // Total deposited per user, summed from their wallet history.
  const depositTotal = (u: UserRow) =>
    Object.values((u as RawUser).history || {})
      .filter((h) => h.type === "Deposit")
      .reduce((sum, h) => sum + (h.amount ?? 0), 0);

  const searched = disguised.filter((u) =>
    `${u.name ?? ""} ${u.email ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );
  const sorted =
    sortMode === "deposits"
      ? [...searched].sort((a, b) => depositTotal(b) - depositTotal(a))
      : sortMode === "wallet"
        ? [...searched].sort((a, b) => (b.wallet ?? 0) - (a.wallet ?? 0))
        : sortMode === "orders"
          ? [...searched].sort((a, b) => (orderCounts[b.uid] ?? 0) - (orderCounts[a.uid] ?? 0))
          : searched;
  const list = sorted.slice(0, listLimit);

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
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["none", "All users"],
            ["deposits", "High deposit"],
            ["wallet", "High wallet balance"],
            ["orders", "High orders"],
          ] as [SortMode, string][]
        ).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => {
              setSortMode(mode);
              setListLimit(5);
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              sortMode === mode
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {sorted.length > listLimit ? (
        <div className="flex flex-wrap gap-2">
          {[5, 20, 50].filter((n) => n > listLimit && n < sorted.length).map((n) => (
            <button
              key={n}
              onClick={() => setListLimit(n)}
              className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold"
            >
              Show {n}
            </button>
          ))}
          <button
            onClick={() => setListLimit(sorted.length)}
            className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground"
          >
            Show all ({sorted.length})
          </button>
        </div>
      ) : null}
      <button
        onClick={() => {
          setAllWalletOpen(!allWalletOpen);
          setWalletLimit(5);
          setWalletSearch("");
        }}
        className={`w-full rounded-xl px-3 py-2.5 text-xs font-black ${
          allWalletOpen ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        {allWalletOpen ? "Hide wallet changes" : `Wallet changes (${allWalletRows.length})`}
      </button>
      {allWalletOpen ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
          <input
            className={input}
            placeholder="Search user, type or description"
            value={walletSearch}
            onChange={(e) => {
              setWalletSearch(e.target.value);
              setWalletLimit(5);
            }}
          />
          {walletFiltered.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-muted-foreground">
              No wallet changes found.
            </p>
          ) : (
            walletFiltered.slice(0, walletLimit).map((h) => (
              <div
                key={`${h.userEmail}-${h.id}`}
                className="flex items-center justify-between rounded-xl border border-border p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold">
                    {h.userName} <span className="text-muted-foreground">({h.userEmail})</span>
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {h.type} — {h.desc}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {h.date ? new Date(h.date).toLocaleString() : ""}
                  </p>
                </div>
                <span className="text-sm font-black">${h.amount ?? 0}</span>
              </div>
            ))
          )}
          {walletFiltered.length > walletLimit ? (
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              {[20, 50].filter((n) => n > walletLimit && n < walletFiltered.length).map((n) => (
                <button
                  key={n}
                  onClick={() => setWalletLimit(n)}
                  className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold"
                >
                  Show {n}
                </button>
              ))}
              <button
                onClick={() => setWalletLimit(walletFiltered.length)}
                className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground"
              >
                Show all ({walletFiltered.length})
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {list.map((u) => (
        <div key={u.uid} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{u.name || "User"}</p>
              <p className="truncate text-xs text-muted-foreground">{u.email}</p>
            </div>
            <span className="text-sm font-black">${u.wallet ?? 0}</span>
          </div>
          {sortMode !== "none" ? (
            <p className="mt-1 text-[11px] font-bold text-muted-foreground">
              {sortMode === "deposits"
                ? `Total deposited: $${depositTotal(u).toFixed(2)}`
                : sortMode === "orders"
                  ? `Orders: ${orderCounts[u.uid] ?? 0}`
                  : `Wallet balance: $${u.wallet ?? 0}`}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => setWallet(u)}
              className="rounded-lg bg-muted px-3 py-1.5 text-xs font-bold"
            >
              Set balance
            </button>
            <button
              onClick={() => {
                setHistoryFor(historyFor === u.uid ? null : u.uid);
                setHistoryLimit(5);
              }}
              className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"
            >
              {historyFor === u.uid ? "Hide history" : "Wallet history"}
            </button>
            {u.uid === user?.uid ? (
              <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">
                You
              </span>
            ) : isFixedOwner(u.email) ? (
              <span className="rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-600">
                Permanent owner
              </span>
            ) : (
              <button
                onClick={async () => {
                  if (!db) return;
                  const removing = u.isAdmin || u.hidden;
                  if (!removing) return notify("Only permanent owners can be admin");
                  await update(ref(db, `users/${u.uid}`), {
                    isAdmin: false,
                    isOwner: false,
                    ownerRevoked: true,
                  });
                  notify("Access removed");
                }}
                className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"
              >
                Remove admin
              </button>
            )}
          </div>
          {historyFor === u.uid ? (
            <div className="mt-3 space-y-2 border-t border-border pt-3">
              <p className="text-xs font-black text-muted-foreground">Wallet history</p>
              {history.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-muted-foreground">
                  No transactions yet.
                </p>
              ) : (
                history.slice(0, historyLimit).map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between rounded-xl border border-border p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-xs font-bold">
                        {h.type}
                        {h.status ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              h.status === "Paid"
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {h.status}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">{h.desc}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {h.date ? new Date(h.date).toLocaleString() : ""}
                      </p>
                    </div>
                    <span className="text-sm font-black">${h.amount ?? 0}</span>
                  </div>
                ))
              )}
              {history.length > historyLimit ? (
                <div className="flex flex-wrap justify-center gap-2 pt-1">
                  {[20, 50].filter((n) => n > historyLimit && n < history.length).map((n) => (
                    <button
                      key={n}
                      onClick={() => setHistoryLimit(n)}
                      className="rounded-lg border border-border px-3 py-1.5 text-[11px] font-bold"
                    >
                      Show {n}
                    </button>
                  ))}
                  <button
                    onClick={() => setHistoryLimit(history.length)}
                    className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground"
                  >
                    Show all ({history.length})
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
      {list.length === 0 ? <Empty text="No users found." /> : null}
    </div>
  );
}



