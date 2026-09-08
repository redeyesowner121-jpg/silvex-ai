import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { get, onValue, push, ref, remove, set, update } from "firebase/database";
import { useStore, isOwnerEmail, type Product, type Category } from "@/context/StoreContext";
import { fileToCompressedDataUrl } from "@/lib/image-upload";


export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin Panel — RKR Premium Store" },
      { name: "description", content: "Manage products, orders, wallet requests and store settings." },
      { property: "og:title", content: "Admin Panel — RKR Premium Store" },
      { property: "og:description", content: "Store management for RKR Premium Store admins." },
      { property: "og:type", content: "website" },
      { name: "robots", content: "noindex" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Admin,
});

const input = "w-full rounded-xl border border-border bg-muted/60 p-2.5 text-sm outline-none";
const TABS = ["Orders", "Requests", "Products", "Coupons", "Users", "Settings"] as const;
type Tab = (typeof TABS)[number];

type OrderRow = {
  orderId: string;
  uid: string;
  email: string;
  total: number;
  status: string;
  phone?: string;
  note?: string;
  date: string;
  items?: Array<{ title: string; qty: number }>;
};

type RequestRow = {
  id: string;
  uid: string;
  name?: string;
  email?: string;
  type: "Deposit" | "Withdraw";
  amount: number;
  utr?: string;
  upi?: string;
  status: string;
  date: string;
};

function Admin() {
  const { db, isAdmin, ready, user, products, config, banner, notify, showSuccess } = useStore();
  const [tab, setTab] = useState<Tab>("Orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [coupons, setCoupons] = useState<Array<{ code: string; type: string; value: number }>>([]);

  useEffect(() => {
    if (!db || !isAdmin) return;
    const un1 = onValue(ref(db, "orders"), (s) =>
      setOrders(
        (Object.values(s.val() || {}) as OrderRow[]).sort((a, b) => (a.date < b.date ? 1 : -1)),
      ),
    );
    const un2 = onValue(ref(db, "requests"), (s) =>
      setRequests(
        Object.entries(s.val() || {})
          .map(([id, r]) => ({ id, ...(r as Omit<RequestRow, "id">) }))
          .sort((a, b) => (a.date < b.date ? 1 : -1)),
      ),
    );
    const un3 = onValue(ref(db, "coupons"), (s) =>
      setCoupons(
        Object.entries(s.val() || {}).map(([code, c]) => ({
          code,
          ...(c as { type: string; value: number }),
        })),
      ),
    );
    return () => {
      un1();
      un2();
      un3();
    };
  }, [db, isAdmin]);

  if (!ready) return <p className="py-20 text-center text-sm text-muted-foreground">Loading…</p>;

  if (!user || !isAdmin) {
    return (
      <div className="rounded-2xl bg-card p-8 text-center shadow-sm">
        <h1 className="mb-2 text-lg font-black">Admin only</h1>
        <p className="text-sm text-muted-foreground">
          This area is for store admins. Ask an existing admin to enable admin access on your
          account.
        </p>
      </div>
    );
  }

  async function setOrderStatus(o: OrderRow, status: string) {
    if (!db) return;
    await update(ref(db, `orders/${o.orderId}`), { status });
    notify(`Order marked ${status}`);
  }

  async function decideRequest(r: RequestRow, approve: boolean) {
    if (!db) return;
    if (approve) {
      const w = await get(ref(db, `users/${r.uid}/wallet`));
      const current = Number(w.val()) || 0;
      const next = r.type === "Deposit" ? current + Number(r.amount) : current - Number(r.amount);
      if (next < 0) return notify("User has insufficient balance");
      await set(ref(db, `users/${r.uid}/wallet`), next);
      await push(ref(db, `users/${r.uid}/history`), {
        type: r.type,
        amount: r.amount,
        desc: `${r.type} approved`,
        date: new Date().toISOString(),
      });
    }
    await update(ref(db, `requests/${r.id}`), { status: approve ? "Approved" : "Rejected" });
    notify(approve ? "Approved" : "Rejected");
  }

  return (
    <div className="fade-in">
      <h1 className="mb-4 text-2xl font-black">Admin panel</h1>
      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold ${
              tab === t ? "bg-foreground text-background" : "bg-card shadow-sm"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Orders" ? (
        <div className="space-y-3">
          {orders.map((o) => (
            <div key={o.orderId} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex justify-between text-xs font-bold">
                <span>#{o.orderId.slice(-6)}</span>
                <span>{o.status}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {o.email} · {o.phone}
              </p>
              <ul className="my-2 text-sm">
                {(o.items || []).map((i, idx) => (
                  <li key={idx}>
                    {i.title} × {i.qty}
                  </li>
                ))}
              </ul>
              <p className="text-lg font-black">${o.total}</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setOrderStatus(o, "Completed")}
                  className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white"
                >
                  Complete
                </button>
                <button
                  onClick={() => setOrderStatus(o, "Cancelled")}
                  className="flex-1 rounded-lg bg-destructive py-2 text-xs font-bold text-destructive-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
          {orders.length === 0 ? <Empty text="No orders yet." /> : null}
        </div>
      ) : null}

      {tab === "Requests" ? (
        <div className="space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex justify-between text-xs font-bold">
                <span>
                  {r.type} · ${r.amount}
                </span>
                <span>{r.status}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {r.name} · {r.email}
              </p>
              <p className="text-xs text-muted-foreground">{r.utr || r.upi}</p>
              {r.status === "Pending" ? (
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => decideRequest(r, true)}
                    className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => decideRequest(r, false)}
                    className="flex-1 rounded-lg bg-destructive py-2 text-xs font-bold text-destructive-foreground"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </div>
          ))}
          {requests.length === 0 ? <Empty text="No wallet requests." /> : null}
        </div>
      ) : null}

      {tab === "Products" ? <ProductsAdmin products={products} /> : null}

      {tab === "Coupons" ? (
        <CouponsAdmin
          coupons={coupons}
          onDone={() => showSuccess("Saved", "Coupon updated successfully.")}
        />
      ) : null}

      {tab === "Users" ? <UsersAdmin /> : null}

      {tab === "Settings" ? <SettingsAdmin config={config} banner={banner} /> : null}

    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-2xl bg-card p-6 text-center text-xs text-muted-foreground shadow-sm">
      {text}
    </p>
  );
}

function ImageField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const { notify } = useStore();
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <p className="text-xs font-bold text-muted-foreground">{label}</p>
      {value ? (
        <div className="flex items-center gap-3">
          <img src={value} alt="" className="h-14 w-14 rounded-lg object-cover" />
          <button onClick={() => onChange("")} className="text-xs font-bold text-destructive">
            Remove
          </button>
        </div>
      ) : null}
      <input
        className={input}
        placeholder="Paste an image link"
        value={value.startsWith("data:") ? "" : value}
        onChange={(e) => onChange(e.target.value)}
      />
      <label className="block cursor-pointer rounded-xl bg-muted py-2 text-center text-xs font-bold">
        {busy ? "Uploading…" : "📷 Upload photo from device"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setBusy(true);
            try {
              onChange(await fileToCompressedDataUrl(file));
            } catch (err) {
              notify(err instanceof Error ? err.message : "Upload failed");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
    </div>
  );
}

const emptyProduct = {
  id: "",
  type: "Service",
  title: "",
  desc: "",
  price: "",
  logo: "",
  link: "",
  delivery: "manual" as "manual" | "auto" | "repeat",
};

function ProductsAdmin({ products }: { products: Product[] }) {
  const { db, notify, categories } = useStore();
  const [form, setForm] = useState(emptyProduct);
  const [bulk, setBulk] = useState("");

  const editing = products.find((p) => p.id === form.id);
  const stockCount = Array.isArray(editing?.stock) ? editing.stock.filter(Boolean).length : 0;

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
        <input
          className={input}
          placeholder="Delivery link / content"
          value={form.link}
          onChange={(e) => setForm({ ...form, link: e.target.value })}
        />
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
        {products.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              {p.logo ? (
                <img src={p.logo} alt="" className="h-10 w-10 rounded-lg object-cover" />
              ) : null}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  ${p.price} · {p.type} · {p.salesCount ?? 0} sold
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
        ))}
      </div>
    </div>
  );
}

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

function UsersAdmin() {
  const { db, user, notify } = useStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [search, setSearch] = useState("");

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


function CouponsAdmin({
  coupons,
  onDone,
}: {
  coupons: Array<{ code: string; type: string; value: number }>;
  onDone: () => void;
}) {
  const { db, notify } = useStore();
  const [form, setForm] = useState({
    code: "",
    type: "flat",
    value: "",
    minOrder: "",
    maxUsage: "1",
  });

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-black">Create coupon</h2>
        <input
          className={`${input} uppercase`}
          placeholder="CODE"
          value={form.code}
          onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
        />
        <div className="flex gap-2">
          <select
            className={input}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            <option value="flat">Flat $</option>
            <option value="percent">Percent %</option>
          </select>
          <input
            className={input}
            placeholder="Value"
            value={form.value}
            onChange={(e) => setForm({ ...form, value: e.target.value })}
          />
        </div>
        <input
          className={input}
          placeholder="Minimum order"
          value={form.minOrder}
          onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
        />
        <input
          className={input}
          placeholder="Usage limit per user"
          value={form.maxUsage}
          onChange={(e) => setForm({ ...form, maxUsage: e.target.value })}
        />
        <button
          onClick={async () => {
            if (!db || !form.code || !form.value) return notify("Code and value are required");
            await set(ref(db, `coupons/${form.code}`), {
              type: form.type,
              value: Number(form.value),
              minOrder: Number(form.minOrder || 0),
              maxUsage: Number(form.maxUsage || 1),
            });
            setForm({ code: "", type: "flat", value: "", minOrder: "", maxUsage: "1" });
            onDone();
          }}
          className="btn-grad w-full rounded-xl py-2.5 text-sm font-bold"
        >
          Create coupon
        </button>
      </div>
      <div className="space-y-2">
        {coupons.map((c) => (
          <div
            key={c.code}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
          >
            <span className="font-bold">{c.code}</span>
            <span className="text-muted-foreground">
              {c.type === "percent" ? `${c.value}%` : `$${c.value}`}
            </span>
            <button
              onClick={async () => db && (await remove(ref(db, `coupons/${c.code}`)))}
              className="text-xs font-bold text-destructive"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsAdmin({
  config,
  banner,
}: {
  config: {
    qr?: string;
    fee?: number;
    marquee?: string;
    siteName?: string;
    siteTagline?: string;
    depositAddress?: string;
    supportLink?: string;
    minOrder?: number;
    categories?: Category[];
  };
  banner: { title?: string; desc?: string; link?: string };
}) {
  const { db, products, notify, categories: liveCategories } = useStore();
  const [cfg, setCfg] = useState({
    qr: config.qr ?? "",
    fee: String(config.fee ?? 25),
    marquee: config.marquee ?? "",
    siteName: config.siteName ?? "RKR Premium",
    siteTagline: config.siteTagline ?? "",
    depositAddress: config.depositAddress ?? "",
    supportLink: config.supportLink ?? "",
    minOrder: String(config.minOrder ?? 0),
  });
  const [cats, setCats] = useState<Category[]>(liveCategories);
  const [bn, setBn] = useState({
    title: banner.title ?? "",
    desc: banner.desc ?? "",
    link: banner.link ?? "",
  });
  const [notice, setNotice] = useState("");
  const [fs, setFs] = useState({ pid: "", price: "", hours: "2" });

  async function saveConfig(extra: Record<string, unknown> = {}) {
    if (!db) return;
    await update(ref(db, "site_settings/config"), {
      qr: cfg.qr,
      fee: Number(cfg.fee || 0),
      marquee: cfg.marquee,
      siteName: cfg.siteName,
      siteTagline: cfg.siteTagline,
      depositAddress: cfg.depositAddress.trim(),
      supportLink: cfg.supportLink,
      minOrder: Number(cfg.minOrder || 0),
      ...extra,
    });
    notify("Settings saved");
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-black">Store identity</h2>
        <input
          className={input}
          placeholder="Website name"
          value={cfg.siteName}
          onChange={(e) => setCfg({ ...cfg, siteName: e.target.value })}
        />
        <input
          className={input}
          placeholder="Tagline"
          value={cfg.siteTagline}
          onChange={(e) => setCfg({ ...cfg, siteTagline: e.target.value })}
        />
        <input
          className={input}
          placeholder="Support / WhatsApp link"
          value={cfg.supportLink}
          onChange={(e) => setCfg({ ...cfg, supportLink: e.target.value })}
        />
        <input
          className={input}
          placeholder="Scrolling notice text"
          value={cfg.marquee}
          onChange={(e) => setCfg({ ...cfg, marquee: e.target.value })}
        />
        <button
          onClick={() => saveConfig()}
          className="btn-grad w-full rounded-xl py-2.5 text-sm font-bold"
        >
          Save identity
        </button>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-black">Payments</h2>
        <input
          className={`${input} font-mono text-xs`}
          placeholder="Crypto deposit address (0x...)"
          value={cfg.depositAddress}
          onChange={(e) => setCfg({ ...cfg, depositAddress: e.target.value })}
        />
        <input
          className={input}
          placeholder="Withdraw fee (%)"
          value={cfg.fee}
          onChange={(e) => setCfg({ ...cfg, fee: e.target.value })}
        />
        <input
          className={input}
          placeholder="Minimum order ($)"
          value={cfg.minOrder}
          onChange={(e) => setCfg({ ...cfg, minOrder: e.target.value })}
        />
        <ImageField
          label="Payment QR photo"
          value={cfg.qr}
          onChange={(qr) => setCfg({ ...cfg, qr })}
        />
        <button
          onClick={async () => {
            const addr = cfg.depositAddress.trim();
            if (addr && !/^0x[0-9a-fA-F]{40}$/.test(addr))
              return notify("That deposit address does not look right");
            await saveConfig();
          }}
          className="btn-grad w-full rounded-xl py-2.5 text-sm font-bold"
        >
          Save payment settings
        </button>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-black">Categories</h2>
        {cats.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input
              className={`${input} w-16 text-center`}
              value={c.icon ?? ""}
              placeholder="🙂"
              onChange={(e) =>
                setCats(cats.map((x, xi) => (xi === i ? { ...x, icon: e.target.value } : x)))
              }
            />
            <input
              className={input}
              value={c.label}
              placeholder="Name"
              onChange={(e) =>
                setCats(cats.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))
              }
            />
            <button
              onClick={() => setCats(cats.filter((_, xi) => xi !== i))}
              className="rounded-xl bg-destructive/10 px-3 text-xs font-bold text-destructive"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={() => setCats([...cats, { label: "", icon: "✨" }])}
          className="w-full rounded-xl bg-muted py-2 text-xs font-bold"
        >
          + Add category
        </button>
        <button
          onClick={() =>
            saveConfig({ categories: cats.filter((c) => c.label.trim()) })
          }
          className="btn-grad w-full rounded-xl py-2.5 text-sm font-bold"
        >
          Save categories
        </button>
      </div>


      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-black">Home banner</h2>
        <input
          className={input}
          placeholder="Title"
          value={bn.title}
          onChange={(e) => setBn({ ...bn, title: e.target.value })}
        />
        <input
          className={input}
          placeholder="Description"
          value={bn.desc}
          onChange={(e) => setBn({ ...bn, desc: e.target.value })}
        />
        <button
          onClick={async () => {
            if (!db) return;
            await set(ref(db, "site_settings/banner"), bn);
            notify("Banner updated");
          }}
          className="btn-grad w-full rounded-xl py-2.5 text-sm font-bold"
        >
          Update banner
        </button>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-black">Flash sale</h2>
        <select
          className={input}
          value={fs.pid}
          onChange={(e) => setFs({ ...fs, pid: e.target.value })}
        >
          <option value="">Select product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} (${p.price})
            </option>
          ))}
        </select>
        <input
          className={input}
          placeholder="Sale price"
          value={fs.price}
          onChange={(e) => setFs({ ...fs, price: e.target.value })}
        />
        <input
          className={input}
          placeholder="Duration (hours)"
          value={fs.hours}
          onChange={(e) => setFs({ ...fs, hours: e.target.value })}
        />
        <div className="flex gap-2">
          <button
            onClick={async () => {
              if (!db || !fs.pid || !fs.price) return notify("Pick a product and price");
              await set(ref(db, "site_settings/flash_sale"), {
                pid: fs.pid,
                price: Number(fs.price),
                endTime: Date.now() + Number(fs.hours || 1) * 3600000,
              });
              notify("Flash sale started");
            }}
            className="flex-1 rounded-xl bg-destructive py-2.5 text-sm font-bold text-destructive-foreground"
          >
            Start sale
          </button>
          <button
            onClick={async () => db && (await remove(ref(db, "site_settings/flash_sale")))}
            className="rounded-xl bg-muted px-4 text-sm font-bold"
          >
            Stop
          </button>
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
        <h2 className="text-sm font-black">Send notification</h2>
        <input
          className={input}
          placeholder="Message..."
          value={notice}
          onChange={(e) => setNotice(e.target.value)}
        />
        <button
          onClick={async () => {
            if (!db || !notice) return;
            await push(ref(db, "notifications"), { msg: notice, date: new Date().toISOString() });
            setNotice("");
            notify("Notification sent");
          }}
          className="btn-grad w-full rounded-xl py-2.5 text-sm font-bold"
        >
          Send to everyone
        </button>
      </div>
    </div>
  );
}
