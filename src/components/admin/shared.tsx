import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { get, onValue, push, ref, remove, set, update } from "firebase/database";
import { useStore, isOwnerEmail, type Product, type Category } from "@/context/StoreContext";
import { fileToCompressedDataUrl } from "@/lib/image-upload";
import { exportOrdersCsv, exportOrdersPdf, type ExportRow } from "@/lib/export-orders";
import { sendSmtpMail } from "@/lib/mail.functions";
import { deliveryBlock, emailShell, sendMail } from "@/lib/mailer";
import { notifyTelegramOrder } from "@/lib/telegram.functions";


export const input = "w-full rounded-xl border border-border bg-muted/60 p-2.5 text-sm outline-none";
export const SECTIONS = {
  Analysis: ["Dashboard", "Orders"],
  Management: ["Requests", "Products", "Coupons", "Users", "Bot buttons", "Settings"],
} as const;
export type Section = keyof typeof SECTIONS;
export type Tab = (typeof SECTIONS)[Section][number];

export type OrderRow = {
  orderId: string;
  uid: string;
  email: string;
  total: number;
  status: string;
  phone?: string;
  note?: string;
  date: string;
  deliveryNote?: string;
  delivered?: Array<{ title: string; content: string }>;
  items?: Array<{ id?: string; title: string; qty: number; price?: number }>;
};



export type RequestRow = {
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

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[11px] font-bold text-muted-foreground">{label}</p>
      <p className="text-xl font-black">{value}</p>
      {sub ? <p className="text-[10px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

export function Empty({ text }: { text: string }) {

  return (
    <p className="rounded-2xl bg-card p-6 text-center text-xs text-muted-foreground shadow-sm">
      {text}
    </p>
  );
}

export function ImageField({
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

export const emptyProduct = {
  id: "",
  type: "Service",
  title: "",
  desc: "",
  price: "",
  logo: "",
  link: "",
  delivery: "manual" as "manual" | "auto" | "repeat",
};

