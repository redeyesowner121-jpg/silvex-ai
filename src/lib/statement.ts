/** Builds a full CSV statement of orders + wallet changes. Works in browser and server. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRec = any;
export type StatementUser = { uid: string; name?: string; email?: string; wallet?: number; history?: AnyRec };

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function buildStatementCsv(users: StatementUser[], orders: AnyRec[], title = "Statement") {
  const byUid = new Map(users.map((u) => [u.uid, u]));
  const rows: { date: string; cells: unknown[] }[] = [];
  for (const o of orders) {
    if (!o) continue;
    const u = byUid.get(o.uid);
    const items = (o.items || []).map((i: AnyRec) => `${i.title} x${i.qty || 1}`).join("; ");
    const delivered = (o.delivered || []).map((d: AnyRec) => `${d.title}: ${d.content}`).join(" | ");
    rows.push({
      date: String(o.date || ""),
      cells: [o.date, "Order", u?.name || "", u?.email || o.email || "", o.uid, o.orderId, items, -Number(o.total || 0), o.status, delivered || o.deliveryNote || ""],
    });
  }
  for (const u of users) {
    for (const [id, h] of Object.entries(u.history || {})) {
      const x = h as AnyRec;
      const amt = Number(x.amount || 0);
      const negative = /purchase|withdraw|order|buy|debit/i.test(String(x.type));
      rows.push({
        date: String(x.date || ""),
        cells: [x.date, `Wallet: ${x.type}`, u.name || "", u.email || "", u.uid, id, x.desc || "", negative ? -Math.abs(amt) : amt, x.status || "", ""],
      });
    }
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const totalWallet = users.reduce((s, u) => s + Number(u.wallet || 0), 0);
  const lines = [
    esc(title),
    esc(`Generated ${new Date().toISOString()} · ${orders.length} orders · ${users.length} user(s) · wallet balance total $${totalWallet.toFixed(2)}`),
    "",
    ["Date", "Kind", "Name", "Email", "User ID", "Reference", "Details", "Amount ($)", "Status", "Delivery"].map(esc).join(","),
    ...rows.map((r) => r.cells.map(esc).join(",")),
    "",
    ["User ID", "Name", "Email", "Current wallet ($)"].map(esc).join(","),
    ...users.map((u) => [u.uid, u.name, u.email, Number(u.wallet || 0).toFixed(2)].map(esc).join(",")),
  ];
  return lines.join("\n");
}

export function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
