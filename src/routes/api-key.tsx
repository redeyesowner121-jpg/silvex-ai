import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ref, update, set } from "firebase/database";
import { useStore } from "@/context/StoreContext";

export const Route = createFileRoute("/api-key")({
  head: () => ({
    meta: [
      { title: "Reseller API Key — SILENT SELLER" },
      { name: "description", content: "Get your personal API key to resell products automatically." },
      { property: "og:title", content: "Reseller API Key — SILENT SELLER" },
      { property: "og:description", content: "Get your personal API key to resell products automatically." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApiKeyPage,
});

function newKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "sk_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function ApiKeyPage() {
  const { db, user, profile, openModal, showSuccess, notify } = useStore();
  const [busy, setBusy] = useState(false);
  const key = (profile as any)?.apiKey as string | undefined;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-bold">Reseller API</h1>
        <p className="mb-6 text-sm text-muted-foreground">Log in to get your personal API key.</p>
        <button
          onClick={() => openModal("auth")}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
        >
          Login
        </button>
      </div>
    );
  }

  async function generate() {
    if (!db || !user) return;
    setBusy(true);
    try {
      const k = newKey();
      if (key) await set(ref(db, `apiKeys/${key}`), null);
      await set(ref(db, `apiKeys/${k}`), user.uid);
      await update(ref(db, `users/${user.uid}`), { apiKey: k, apiEnabled: true });
      showSuccess("API key ready", "Keep it private — it spends your wallet balance.");
    } finally {
      setBusy(false);
    }
  }

  const base = "https://silvex-ai.com/api/public/reseller";

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-1 text-xl font-bold">Reseller API</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Sell our products from your own site or bot. The same key works for your website account and
        your Telegram account, and orders are paid from your wallet balance.
      </p>

      <div className="mb-4 rounded-2xl border border-border p-4">
        <p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Your personal key</p>
        <p className="mb-3 break-all rounded-xl bg-muted p-3 font-mono text-xs">
          {key || "No key yet — generate one below."}
        </p>
        <div className="flex gap-2">
          {key ? (
            <button
              onClick={() => {
                navigator.clipboard.writeText(key);
                notify("API key copied");
              }}
              className="flex-1 rounded-xl border border-border py-2.5 text-xs font-bold"
            >
              Copy
            </button>
          ) : null}
          <button
            onClick={generate}
            disabled={busy}
            className="flex-1 rounded-xl bg-primary py-2.5 text-xs font-bold text-primary-foreground disabled:opacity-60"
          >
            {key ? "Generate new key" : "Generate key"}
          </button>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border p-4 text-xs leading-relaxed">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Getting started</p>
          <p>
            Base URL: <code className="break-all">{base}</code>
          </p>
          <p className="mt-1">
            Send your key on every request in the <code>x-api-key</code> header. All prices and
            balances are in dollars.
          </p>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Endpoints</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-muted p-3 font-mono text-[11px]">
{`GET  ${base}/me
GET  ${base}/balance
GET  ${base}/products
GET  ${base}/orders
GET  ${base}/orders/ORDER_ID
POST ${base}/order
     { "productId": "ID", "qty": 1 }`}
          </pre>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Example order</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-muted p-3 font-mono text-[11px]">
{`curl -X POST ${base}/order \\
  -H "x-api-key: ${key || "YOUR_KEY"}" \\
  -H "content-type: application/json" \\
  -d '{"productId":"ID","qty":1}'`}
          </pre>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Answers</p>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-muted p-3 font-mono text-[11px]">
{`{
  "ok": true,
  "orderId": "...",
  "status": "Completed",
  "total": 4.5,
  "balance": 20.5,
  "delivered": [{ "title": "...", "content": "..." }]
}`}
          </pre>
          <p className="mt-2 text-muted-foreground">
            Instant items are delivered inside the order answer. Manual items come back as
            <code> pending</code> and are delivered by us — check <code>/orders/ORDER_ID</code> or your
            orders page.
          </p>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-bold uppercase text-muted-foreground">Errors</p>
          <p className="text-muted-foreground">
            <code>401</code> wrong or missing key · <code>404</code> unknown product or order ·{" "}
            <code>400</code> not enough balance or stock. Keep your key private — anyone holding it
            can spend your wallet.
          </p>
        </div>
      </div>
    </div>
  );
}
