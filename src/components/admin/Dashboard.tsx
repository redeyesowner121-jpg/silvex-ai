import { createFileRoute } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useState } from "react";
import { get, onValue, push, ref, remove, set, update } from "firebase/database";
import { useStore, isOwnerEmail, type Product, type Category } from "@/context/StoreContext";
import { fileToCompressedDataUrl } from "@/lib/image-upload";
import { exportOrdersCsv, exportOrdersPdf, type ExportRow } from "@/lib/export-orders";
import { sendSmtpMail } from "@/lib/mail.functions";
import { deliveryBlock, emailShell, sendMail } from "@/lib/mailer";
import { notifyTelegramOrder } from "@/lib/telegram.functions";


import { input, Stat, Empty, ImageField, type OrderRow } from "@/components/admin/shared";

export function Dashboard({
  orders,
  products,
  config,
  onRefresh,
}: {
  orders: OrderRow[];
  products: Product[];
  config: { lowStockAlert?: number };
  onRefresh: () => void | Promise<void>;
}) {
  const threshold = Number(config.lowStockAlert ?? 5);
  const autoProducts = products.filter((p) => p.delivery === "auto");
  const totalStock = autoProducts.reduce((s, p) => s + (p.stock || []).filter(Boolean).length, 0);
  const { db } = useStore();
  const [usedStock, setUsedStock] = useState(0);
  const [users, setUsers] = useState({ total: 0, telegram: 0, web: 0, joins: [] as number[] });
  const [range, setRange] = useState<7 | 30 | 0>(7);
  useEffect(() => {
    if (!db) return;
    get(ref(db, "usedStock"))
      .then((snap) => {
        const val = (snap.val() || {}) as Record<string, Record<string, unknown>>;
        setUsedStock(Object.values(val).reduce((n, m) => n + Object.keys(m || {}).length, 0));
      })
      .catch(() => undefined);
    return onValue(ref(db, "users"), (snap) => {
      const val = (snap.val() || {}) as Record<string, { telegramChatId?: number; joined?: string }>;
      const rows = Object.entries(val);
      const telegram = rows.filter(([id, u]) => id.startsWith("tg_") || !!u?.telegramChatId).length;
      const joins = rows
        .map(([, u]) => new Date(u?.joined || "").getTime())
        .filter((t) => Number.isFinite(t) && t > 0);
      setUsers({ total: rows.length, telegram, web: rows.length - telegram, joins });
    });
  }, [db]);
  const lowStock = autoProducts.filter(
    (p) => (p.stock || []).filter(Boolean).length <= threshold,
  );

  const valid = orders.filter((o) => o.status !== "Cancelled");
  const now = Date.now();
  const since = (days: number) => now - days * 86400000;
  const sum = (list: OrderRow[]) => list.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const inRange = (from: number, to = now) =>
    valid.filter((o) => {
      const t = new Date(o.date).getTime();
      return t >= from && t < to;
    });

  const thisWeek = inRange(since(7));
  const lastWeek = inRange(since(14), since(7));
  const today = inRange(since(1));
  const pending = orders.filter((o) => o.status === "Pending").length;

  // Chart buckets: daily for 7/30 days, monthly for all time.
  const firstEvent = Math.min(
    ...[...valid.map((o) => new Date(o.date).getTime()), ...users.joins].filter((t) =>
      Number.isFinite(t),
    ),
    now,
  );
  const monthly = range === 0;
  const buckets: { label: string; from: number; to: number }[] = [];
  if (monthly) {
    const start = new Date(firstEvent);
    start.setHours(0, 0, 0, 0);
    start.setDate(1);
    const cursor = new Date(start);
    while (cursor.getTime() <= now) {
      const from = cursor.getTime();
      const next = new Date(cursor);
      next.setMonth(next.getMonth() + 1);
      buckets.push({
        label: cursor.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        from,
        to: next.getTime(),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  } else {
    for (let i = range - 1; i >= 0; i--) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - i);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      buckets.push({
        label: start.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        from: start.getTime(),
        to: end.getTime(),
      });
    }
  }

  const chartData = buckets.map((b) => {
    const list = inRange(b.from, b.to);
    return {
      label: b.label,
      earning: Number(sum(list).toFixed(2)),
      sales: list.length,
      newUsers: users.joins.filter((t) => t >= b.from && t < b.to).length,
    };
  });

  const rangeTotals = chartData.reduce(
    (a, d) => ({
      earning: a.earning + d.earning,
      sales: a.sales + d.sales,
      newUsers: a.newUsers + d.newUsers,
    }),
    { earning: 0, sales: 0, newUsers: 0 },
  );

  // Cumulative user growth for the small users graph.
  let running = users.total - users.joins.filter((t) => t >= buckets[0]!.from).length;
  const userGrowth = chartData.map((d) => {
    running += d.newUsers;
    return { label: d.label, users: running };
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-black">Overview</h2>
        <button
          onClick={() => onRefresh()}
          className="rounded-lg bg-card px-3 py-1.5 text-xs font-bold shadow-sm"
        >
          ↻ Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Available stock" value={String(totalStock)} />
        <Stat label="Used stock" value={String(usedStock)} />
        <Stat label="This week" value={`$${sum(thisWeek)}`} sub={`${thisWeek.length} orders`} />
        <Stat label="Today" value={`$${sum(today)}`} sub={`${today.length} orders`} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Last week" value={`$${sum(lastWeek)}`} sub={`${lastWeek.length} orders`} />
        <Stat label="All time" value={`$${sum(valid)}`} sub={`${valid.length} orders`} />
        <Stat label="Pending orders" value={String(pending)} />
        <Stat label="Low stock items" value={String(lowStock.length)} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Total users"
          value={String(users.total)}
          sub={`${users.web} website • ${users.telegram} telegram`}
        />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-black">Earnings • Sales • New users</h3>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {([7, 30, 0] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${
                  range === r ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {r === 0 ? "All time" : `${r} days`}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[10px] font-bold text-muted-foreground">Earning</p>
            <p className="text-sm font-black">${rangeTotals.earning.toFixed(2)}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[10px] font-bold text-muted-foreground">Sales</p>
            <p className="text-sm font-black">{rangeTotals.sales}</p>
          </div>
          <div className="rounded-xl bg-muted/50 px-2 py-2">
            <p className="text-[10px] font-bold text-muted-foreground">New users</p>
            <p className="text-sm font-black">{rangeTotals.newUsers}</p>
          </div>
        </div>

        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                minTickGap={16}
              />
              <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={26} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  fontSize: 12,
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="left"
                dataKey="earning"
                name="Earning ($)"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="sales"
                name="Sales"
                stroke="hsl(var(--accent-foreground))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="newUsers"
                name="New users"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-black">User growth</h3>
          <span className="text-xs font-bold text-muted-foreground">{users.total} total</span>
        </div>
        <div className="h-32 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={userGrowth} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="userFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 9 }} minTickGap={20} />
              <YAxis tick={{ fontSize: 9 }} width={28} />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  fontSize: 12,
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Area
                type="monotone"
                dataKey="users"
                name="Users"
                stroke="hsl(var(--primary))"
                fill="url(#userFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-2 text-sm font-black">
          Low stock products{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({threshold} or fewer left)
          </span>
        </h3>
        {lowStock.length ? (
          <div className="space-y-1">
            {lowStock.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs font-bold"
              >
                <span className="truncate">{p.title}</span>
                <span className="text-destructive">
                  {(p.stock || []).filter(Boolean).length} left
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">All auto-delivery products are stocked.</p>
        )}
      </div>
    </div>
  );
}

