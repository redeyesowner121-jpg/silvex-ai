import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ref, remove, update } from "firebase/database";
import { useStore, type Product } from "@/context/StoreContext";
import { input, Empty } from "@/components/admin/shared";
import {
  listProviders,
  saveProvider,
  importProviderProducts,
  pruneApiProducts,
} from "@/lib/providers.functions";
import { broadcastProductEvent } from "@/lib/broadcast.functions";

type Row = {
  id: string;
  name: string;
  url: string;
  key: string;
  docs: string;
  markup: number;
  enabled: boolean;
  balance: number | null;
  currency: string;
};

export function ProvidersAdmin({ products }: { products: Product[] }) {
  const { db, notify } = useStore();
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, Partial<Row>>>({});


  async function load() {
    setBusy("load");
    const r = await listProviders();
    setBusy(null);
    if (r.ok) setRows(r.providers as Row[]);
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  const byProvider = useMemo(() => {
    const map: Record<string, Product[]> = {};
    for (const p of products) {
      if (p.delivery !== "supplier") continue;
      const id = p.provider || "custom";
      (map[id] ||= []).push(p);
    }
    return map;
  }, [products]);

  const value = (r: Row, k: keyof Row) => (draft[r.id]?.[k] ?? r[k]) as string | number;

  async function persist(r: Row) {
    setBusy(r.id);
    const d = draft[r.id] || {};
    const res = await saveProvider({
      data: {
        id: r.id,
        name: String(d.name ?? r.name),
        url: String(d.url ?? r.url),
        key: String(d.key ?? r.key),
        markup: Number(d.markup ?? r.markup) || 130,
      },
    });
    setBusy(null);
    notify(res.ok ? "Provider saved" : res.error || "Could not save");
    await load();
  }

  async function toggleProvider(r: Row) {
    setBusy(r.id);
    await saveProvider({ data: { id: r.id, enabled: !r.enabled } });
    setBusy(null);
    notify(r.enabled ? `${r.name} turned off` : `${r.name} turned on`);
    await load();
  }

  async function importAll(r: Row) {
    setBusy(r.id);
    const res = await importProviderProducts({ data: { id: r.id } });
    setBusy(null);
    notify(
      res.ok
        ? `${r.name}: ${res.added} new, ${res.updated} refreshed (new items start hidden)`
        : res.error || "Import failed",
    );
  }

  async function cleanup() {
    setBusy("prune");
    const res = await pruneApiProducts();
    setBusy(null);
    notify(
      res.ok
        ? `Removed ${res.removed} extra items, kept ${res.kept}`
        : res.error || "Cleanup failed",
    );
  }

  async function toggleHidden(p: Product) {
    if (!db) return;
    const showing = Boolean(p.hidden);
    await update(ref(db, `products/${p.id}`), { hidden: !p.hidden });
    notify(showing ? "Shown to customers" : "Hidden from customers");
    // First time an API product goes live, announce it in the bot.
    if (showing && !(p as { announced?: boolean }).announced) {
      await update(ref(db, `products/${p.id}`), { announced: true });
      const r = await broadcastProductEvent({ data: { kind: "new", productId: p.id } });
      if (r.ok) notify(`📣 Announced to ${r.sent} bot users`);
    }
  }

  /** Delete one imported API product — it never comes back on the next import. */
  async function deleteItem(p: Product) {
    if (!db) return;
    if (!confirm(`Delete “${p.title}”? It will not come back on the next import.`)) return;
    await update(ref(db, "site_settings/apiDeleted"), { [p.id]: true });
    await remove(ref(db, `products/${p.id}`));
    notify("Product deleted");
  }

  /** Hide or show every product of one shop at once. */
  async function setAllHidden(items: Product[], hidden: boolean) {
    if (!db || !items.length) return;
    for (const p of items) await update(ref(db, `products/${p.id}`), { hidden });
    notify(hidden ? "All hidden from customers" : "All shown to customers");
  }

  /** Delete every product of one shop at once. */
  async function deleteAll(items: Product[]) {
    if (!db || !items.length) return;
    if (!confirm(`Delete all ${items.length} products of this shop?`)) return;
    for (const p of items) {
      await update(ref(db, "site_settings/apiDeleted"), { [p.id]: true });
      await remove(ref(db, `products/${p.id}`));
    }
    notify(`Deleted ${items.length} products`);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-black">Reseller API delivery products</h2>
          <p className="text-[11px] text-muted-foreground">
            Import products from each API shop, set the profit %, and show or hide them.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => cleanup()}
            disabled={busy === "prune"}
            className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"
          >
            {busy === "prune" ? "Cleaning…" : "Remove extra items"}
          </button>
          <button
            onClick={() => load()}
            className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"
          >
            Refresh
          </button>
        </div>
      </div>

      {rows.length === 0 ? <Empty text="Loading API shops…" /> : null}

      {rows.map((r) => {
        const items = byProvider[r.id] || [];
        const cheapest = items.length
          ? Math.min(...items.map((p) => Number(p.supplierPrice ?? 0)))
          : 0;
        const costliest = items.reduce((m, p) => Math.max(m, Number(p.supplierPrice ?? 0)), 0);
        const low = r.balance != null && items.length > 0 && r.balance < costliest;
        const empty = r.balance != null && items.length > 0 && r.balance < cheapest;
        return (
          <div
            key={r.id}
            className={`rounded-2xl border p-4 ${
              low ? "border-destructive/40 bg-destructive/5" : "border-border bg-card"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">
                  {r.name}{" "}
                  <span
                    className={`ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      r.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {r.enabled ? "ON" : "OFF"}
                  </span>
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {items.length} product(s) ·{" "}
                  <span className={low ? "font-bold text-destructive" : ""}>
                    balance{" "}
                    {r.balance == null ? "—" : `${r.balance.toFixed(2)} ${r.currency}`}
                  </span>
                </p>
                {low ? (
                  <p className="text-[11px] font-bold text-destructive">
                    {empty
                      ? "Too low to buy anything here — top up this shop."
                      : `Too low for the costliest item ($${costliest.toFixed(2)}).`}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <button
                  onClick={() => importAll(r)}
                  disabled={busy === r.id}
                  className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600 disabled:opacity-60"
                >
                  Import products
                </button>
                <button
                  onClick={() => setOpen(open === r.id ? null : r.id)}
                  className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"
                >
                  {open === r.id ? "Close" : "Open"}
                </button>
              </div>
            </div>

            {open === r.id ? (
              <div className="mt-3 space-y-2">
                <input
                  className={input}
                  placeholder="Shop name"
                  value={String(value(r, "name"))}
                  onChange={(e) =>
                    setDraft({ ...draft, [r.id]: { ...draft[r.id], name: e.target.value } })
                  }
                />
                <input
                  className={input}
                  placeholder="API address"
                  value={String(value(r, "url"))}
                  onChange={(e) =>
                    setDraft({ ...draft, [r.id]: { ...draft[r.id], url: e.target.value } })
                  }
                />
                <input
                  className={input}
                  placeholder="API key"
                  value={String(value(r, "key"))}
                  onChange={(e) =>
                    setDraft({ ...draft, [r.id]: { ...draft[r.id], key: e.target.value } })
                  }
                />
                <input
                  className={input}
                  placeholder="Default profit % (130 = +30%)"
                  value={String(value(r, "markup"))}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [r.id]: { ...draft[r.id], markup: Number(e.target.value) },
                    })
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => persist(r)}
                    disabled={busy === r.id}
                    className="btn-grad rounded-xl px-4 py-2 text-xs font-bold disabled:opacity-60"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => toggleProvider(r)}
                    className="rounded-xl bg-muted px-4 py-2 text-xs font-bold"
                  >
                    {r.enabled ? "Turn off" : "Turn on"}
                  </button>
                  {r.docs ? (
                    <a
                      href={r.docs}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-muted px-4 py-2 text-xs font-bold"
                    >
                      API docs
                    </a>
                  ) : null}
                </div>

                {items.length ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => setAllHidden(items, true)}
                      className="rounded-xl bg-muted px-4 py-2 text-xs font-bold"
                    >
                      Hide all
                    </button>
                    <button
                      onClick={() => setAllHidden(items, false)}
                      className="rounded-xl bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-600"
                    >
                      Show all
                    </button>
                    <button
                      onClick={() => deleteAll(items)}
                      className="rounded-xl bg-destructive/10 px-4 py-2 text-xs font-bold text-destructive"
                    >
                      Delete all
                    </button>
                  </div>
                ) : null}

                <div className="space-y-1 pt-2">
                  {items.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      No products imported yet — tap “Import products”.
                    </p>
                  ) : (
                    items.map((p) => (
                      <div key={p.id} className="rounded-xl bg-muted/50 p-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-bold">{p.title}</p>
                            <p className="text-[10px] text-muted-foreground">
                              cost ${Number(p.supplierPrice ?? 0).toFixed(2)} · sells $
                              {Number(p.price).toFixed(2)} · {p.supplierStock ?? 0} in stock
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <button
                              onClick={() => toggleHidden(p)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                                p.hidden
                                  ? "bg-muted text-muted-foreground"
                                  : "bg-emerald-500/10 text-emerald-600"
                              }`}
                            >
                              {p.hidden ? "Hidden" : "Visible"}
                            </button>
                            <Link to="/admin/edit/$productId" params={{ productId: p.id }} className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary">Edit</Link>
                          </div>
                        </div>
                      </div>
                    ))

                  )}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
