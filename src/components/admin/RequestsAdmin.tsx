import { useEffect, useState } from "react";
import { get, onValue, push, ref, set, update } from "firebase/database";
import { useStore } from "@/context/StoreContext";
import { Empty, type RequestRow } from "@/components/admin/shared";

export function RequestsAdmin() {
  const { db, notify } = useStore();
  const [requests, setRequests] = useState<RequestRow[]>([]);

  useEffect(() => {
    if (!db) return;
    return onValue(ref(db, "requests"), (snapshot) => setRequests(
      Object.entries(snapshot.val() || {})
        .map(([id, request]) => ({ id, ...(request as Omit<RequestRow, "id">) }))
        .sort((a, b) => (a.date < b.date ? 1 : -1)),
    ));
  }, [db]);

  async function decide(request: RequestRow, approve: boolean) {
    if (!db) return;
    if (approve) {
      const wallet = await get(ref(db, `users/${request.uid}/wallet`));
      const current = Number(wallet.val()) || 0;
      const next = request.type === "Deposit" ? current + Number(request.amount) : current - Number(request.amount);
      if (next < 0) return notify("User has insufficient balance");
      await set(ref(db, `users/${request.uid}/wallet`), next);
      await push(ref(db, `users/${request.uid}/history`), { type: request.type, amount: request.amount, desc: `${request.type} approved`, date: new Date().toISOString() });
    }
    await update(ref(db, `requests/${request.id}`), { status: approve ? "Approved" : "Rejected" });
    notify(approve ? "Approved" : "Rejected");
  }

  return (
    <div className="space-y-3">
      {requests.map((request) => (
        <div key={request.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-xs font-bold">
            <span className="min-w-0 truncate">{request.type} · ${request.amount}</span>
            <span className="shrink-0">{request.status}</span>
          </div>
          <p className="mt-1 break-words text-xs text-muted-foreground">{request.name} · {request.email}</p>
          <p className="break-all text-xs text-muted-foreground">{request.utr || request.upi}</p>
          {request.status === "Pending" ? <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => decide(request, true)} className="rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white">Approve</button>
            <button onClick={() => decide(request, false)} className="rounded-lg bg-destructive py-2 text-xs font-bold text-destructive-foreground">Reject</button>
          </div> : null}
        </div>
      ))}
      {!requests.length ? <Empty text="No wallet requests." /> : null}
    </div>
  );
}