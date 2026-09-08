import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { get, onValue, push, ref, remove, set, update } from "firebase/database";
import { useStore, isOwnerEmail, type Product, type Category } from "@/context/StoreContext";
import { fileToCompressedDataUrl } from "@/lib/image-upload";
import { exportOrdersCsv, exportOrdersPdf, type ExportRow } from "@/lib/export-orders";
import { sendSmtpMail } from "@/lib/mail.functions";
import { deliveryBlock, emailShell, sendMail } from "@/lib/mailer";
import { notifyTelegramOrder } from "@/lib/telegram.functions";


import { input, Stat, Empty, ImageField, type OrderRow } from "@/components/admin/shared";

export function CouponsAdmin({
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

