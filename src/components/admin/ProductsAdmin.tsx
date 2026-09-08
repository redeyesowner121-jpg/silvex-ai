import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { get, onValue, push, ref, remove, set, update } from "firebase/database";
import { useStore, isOwnerEmail, type Product, type Category } from "@/context/StoreContext";
import { fileToCompressedDataUrl } from "@/lib/image-upload";
import { exportOrdersCsv, exportOrdersPdf, type ExportRow } from "@/lib/export-orders";
import { sendSmtpMail } from "@/lib/mail.functions";
import { deliveryBlock, emailShell, sendMail } from "@/lib/mailer";
import { notifyTelegramOrder } from "@/lib/telegram.functions";


import { input, Stat, Empty, ImageField, emptyProduct, type OrderRow } from "@/components/admin/shared";

export function ProductsAdmin({ products }: { products: Product[] }) {
  const { db, notify, categories, config } = useStore();
  const [form, setForm] = useState(emptyProduct);
  const [bulk, setBulk] = useState("");
  const [viewing, setViewing] = useState<string | null>(null);
  const [usedMap, setUsedMap] = useState<
    Record<string, Record<string, { content: string; orderId?: string; email?: string; date?: string }>>
  >({});

  const editing = products.find((p) => p.id === form.id);
  const stockCount = Array.isArray(editing?.stock) ? editing.stock.filter(Boolean).length : 0;

  const threshold = Number((config as { lowStockAlert?: number }).lowStockAlert ?? 5);
  const lowStock = products.filter(
    (p) => p.delivery === "auto" && (p.stock || []).filter(Boolean).length <= threshold,
  );

  useEffect(() => {
    if (lowStock.length)
      notify(
        `Low stock: ${lowStock
          .slice(0, 3)
          .map((p) => p.title)
          .join(", ")}${lowStock.length > 3 ? ` +${lowStock.length - 3} more` : ""}`,
      );
    // only alert once per visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lowStock.length]);


  async function save() {
    if (!db || !form.title || !form.price) return notify("Title and price are required");
    const { id, ...rest } = form;
    const data = { ...rest, price: Number(form.price) };
    if (id) {
      await update(ref(db, `products/${id}`), data);
      notify("Product updated");
    } else {
      await push(ref(db, "products"), { ...data, salesCount: 0 });
      notify("Product added");
    }
    setForm(emptyProduct);
    setBulk("");
  }

  async function addStock() {
    if (!db || !form.id) return notify("Save the product first, then add stock");
    const lines = bulk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return notify("Paste at least one line");
    const current = Array.isArray(editing?.stock) ? editing.stock.filter(Boolean) : [];
    await set(ref(db, `products/${form.id}/stock`), [...current, ...lines]);
    setBulk("");
    notify(`${lines.length} stock added`);
  }

  return (
    <div className="space-y-4">
      {lowStock.length ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <h2 className="text-sm font-black text-destructive">
            Low stock alert ({lowStock.length})
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            {threshold} or fewer left — add more stock soon.
          </p>
          <div className="space-y-1">
            {lowStock.map((p) => (
              <button
                key={p.id}
                onClick={() => setViewing(p.id)}
                className="flex w-full items-center justify-between rounded-lg bg-card px-3 py-2 text-left text-xs font-bold"
              >
                <span className="truncate">{p.title}</span>
                <span className="text-destructive">
                  {(p.stock || []).filter(Boolean).length} left
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">

        <h2 className="text-sm font-black">{form.id ? "Edit product" : "Add product"}</h2>
        <select
          className={input}
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
        >
          {categories.map((c) => (
            <option key={c.label}>{c.label}</option>
          ))}
        </select>
        <input
          className={input}
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <input
          className={input}
          placeholder="Description"
          value={form.desc}
          onChange={(e) => setForm({ ...form, desc: e.target.value })}
        />
        <input
          className={input}
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <ImageField
          label="Product photo"
          value={form.logo}
          onChange={(logo) => setForm({ ...form, logo })}
        />
        <select
          className={input}
          value={form.delivery}
          onChange={(e) =>
            setForm({ ...form, delivery: e.target.value as typeof form.delivery })
          }
        >
          <option value="manual">Manual delivery (admin sends it)</option>
          <option value="auto">Auto delivery from stock (1 line = 1 stock)</option>
          <option value="repeat">Repeated delivery (same link every order)</option>
        </select>
        <input
          className={input}
          placeholder={
            form.delivery === "repeat" ? "Link sent to every buyer" : "Delivery link / content"
          }
          value={form.link}
          onChange={(e) => setForm({ ...form, link: e.target.value })}
        />
        {form.delivery === "auto" ? (
          <div className="space-y-2 rounded-xl bg-muted/50 p-3">
            <p className="text-xs font-bold">
              Stock available: {stockCount}
              {form.id ? "" : " — save the product first to add stock"}
            </p>
            <textarea
              className={`${input} min-h-24`}
              placeholder={"Paste stock, one per line\nline1\nline2"}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={addStock}
                className="rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-600"
              >
                Add stock
              </button>
              {stockCount ? (
                <button
                  onClick={async () => {
                    if (db && form.id && confirm("Clear all stock?"))
                      await set(ref(db, `products/${form.id}/stock`), null);
                  }}
                  className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"
                >
                  Clear stock
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="flex gap-2">
          <button onClick={save} className="btn-grad flex-1 rounded-xl py-2.5 text-sm font-bold">
            {form.id ? "Save changes" : "Save product"}
          </button>
          {form.id ? (
            <button
              onClick={() => setForm(emptyProduct)}
              className="rounded-xl bg-muted px-4 text-sm font-bold"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        {products.map((p) => {
          const available = (p.stock || []).filter(Boolean);
          const used = [
            ...Object.values(p.usedStock || {}),
            ...Object.values(usedMap[p.id] || {}),
          ];
          const isLow = p.delivery === "auto" && available.length <= threshold;
          return (
            <div key={p.id} className="rounded-xl border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  {p.logo ? (
                    <img src={p.logo} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : null}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{p.title}</p>
                    <p className="text-xs text-muted-foreground">
                      ${p.price} · {p.type} · {p.salesCount ?? 0} sold ·{" "}
                      {p.delivery === "auto" ? (
                        <span className={isLow ? "font-bold text-destructive" : ""}>
                          {available.length} in stock
                        </span>
                      ) : p.delivery === "repeat" ? (
                        "repeated"
                      ) : (
                        "manual"
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() =>
                      setForm({
                        id: p.id,
                        type: p.type ?? "Service",
                        title: p.title,
                        desc: p.desc ?? "",
                        price: String(p.price),
                        logo: p.logo ?? "",
                        link: p.link ?? "",
                        delivery: p.delivery ?? "manual",
                      })
                    }
                    className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary"
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      if (db && confirm("Delete this product?"))
                        await remove(ref(db, `products/${p.id}`));
                    }}
                    className="rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive"
                  >
                    Delete
                  </button>
                </div>
              </div>

              <button
                onClick={async () => {
                  const next = viewing === p.id ? null : p.id;
                  setViewing(next);
                  if (next && db && !usedMap[next]) {
                    const snap = await get(ref(db, `usedStock/${next}`)).catch(() => null);
                    setUsedMap((m) => ({ ...m, [next]: snap?.val() || {} }));
                  }
                }}
                className="mt-2 w-full rounded-lg bg-muted px-3 py-1.5 text-xs font-bold"
              >
                {viewing === p.id ? "Hide stocks" : "View stocks"} ({available.length} available ·{" "}
                {used.length} used)
              </button>

              {viewing === p.id ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-emerald-500/5 p-2">
                    <p className="mb-1 text-xs font-black text-emerald-600">
                      Available ({available.length})
                    </p>
                    <div className="max-h-48 space-y-1 overflow-auto">
                      {available.length ? (
                        available.map((s, i) => (
                          <p key={i} className="break-all rounded bg-card p-1.5 font-mono text-[11px]">
                            {s}
                          </p>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">No stock left</p>
                      )}
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/60 p-2">
                    <p className="mb-1 text-xs font-black">Used ({used.length})</p>
                    <div className="max-h-48 space-y-1 overflow-auto">
                      {used.length ? (
                        used
                          .slice()
                          .reverse()
                          .map((u, i) => (
                            <div key={i} className="rounded bg-card p-1.5">
                              <p className="break-all font-mono text-[11px]">{u.content}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {u.email || "—"} · {u.orderId || ""} ·{" "}
                                {u.date ? new Date(u.date).toLocaleString() : ""}
                              </p>
                            </div>
                          ))
                      ) : (
                        <p className="text-xs text-muted-foreground">Nothing used yet</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

    </div>
  );
}

