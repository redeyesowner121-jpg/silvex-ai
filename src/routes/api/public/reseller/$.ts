import { createFileRoute } from "@tanstack/react-router";
import { dbGet, dbPatch, dbPush, dbPut, SITE_URL } from "@/lib/telegram.server";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-api-key, authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

async function resolveKey(request: Request): Promise<{ uid: string; user: any } | null> {
  const header = request.headers.get("x-api-key") || request.headers.get("authorization") || "";
  const key = header.replace(/^Bearer\s+/i, "").trim();
  if (!key) return null;
  const uid = await dbGet<string>(`apiKeys/${key}`);
  if (!uid) return null;
  const user = (await dbGet<any>(`users/${uid}`)) || {};
  if (user.apiEnabled === false) return null;
  return { uid, user };
}

function publicProduct(id: string, p: any) {
  const stock = Array.isArray(p.stock) ? p.stock.filter(Boolean).length : 0;
  return {
    id,
    title: p.title || "",
    price: Number(p.price || 0),
    category: p.category || "",
    delivery: p.delivery || "manual",
    inStock: p.delivery === "manual" || p.delivery === "repeat" ? true : stock > 0,
    stock,
    description: p.desc || "",
  };
}

async function handle(request: Request, splat: string): Promise<Response> {
  const path = (splat || "").replace(/^\/+|\/+$/g, "");
  const account = await resolveKey(request);
  if (!account) return json({ ok: false, error: "Invalid or missing API key" }, 401);
  const { uid, user } = account;

  if (path === "me") {
    return json({
      ok: true,
      email: user.email || null,
      name: user.name || null,
      balance: Number(user.wallet || 0),
      currency: "USD",
      website: SITE_URL,
    });
  }

  if (path === "balance") {
    return json({ ok: true, balance: Number(user.wallet || 0), currency: "USD" });
  }

  if (path === "products") {
    const all = (await dbGet<Record<string, any>>("products")) || {};
    return json({
      ok: true,
      products: Object.entries(all)
        .filter(([, p]) => p && p.hidden !== true)
        .map(([id, p]) => publicProduct(id, p)),
    });
  }

  if (path.startsWith("orders/")) {
    const orderId = path.slice("orders/".length);
    const order = await dbGet<any>(`orders/${orderId}`);
    if (!order || order.uid !== uid) return json({ ok: false, error: "Order not found" }, 404);
    return json({
      ok: true,
      order: {
        orderId,
        status: order.status,
        total: Number(order.total || 0),
        delivered: order.delivered || [],
        note: order.deliveryNote || null,
        date: order.date,
      },
    });
  }

  if (path === "orders" && request.method === "GET") {
    const all = (await dbGet<Record<string, any>>("orders")) || {};
    return json({
      ok: true,
      orders: Object.entries(all)
        .filter(([, o]) => o?.uid === uid)
        .map(([id, o]) => ({
          orderId: id,
          status: o.status,
          total: Number(o.total || 0),
          date: o.date,
          delivered: o.delivered || [],
        })),
    });
  }

  if (path === "order" && request.method === "POST") {
    const body = (await request.json().catch(() => null)) as any;
    const productId = String(body?.productId || "").trim();
    const qty = Math.max(1, Math.min(20, Number(body?.qty || 1)));
    if (!productId) return json({ ok: false, error: "productId is required" }, 400);

    const p = await dbGet<any>(`products/${productId}`);
    if (!p) return json({ ok: false, error: "Product not found" }, 404);

    const price = Number(p.price || 0) * qty;
    const balance = Number(user.wallet || 0);
    if (balance < price) {
      return json({ ok: false, error: "Insufficient balance", balance, required: price }, 402);
    }

    const delivered: { title: string; content: string }[] = [];
    let complete = false;
    if (p.delivery === "repeat" && p.link) {
      for (let i = 0; i < qty; i++) delivered.push({ title: p.title || "Item", content: p.link });
      complete = true;
    } else if (p.delivery === "auto") {
      const stock: string[] = Array.isArray(p.stock) ? p.stock.filter(Boolean) : [];
      if (stock.length >= qty) {
        const taken = stock.slice(0, qty);
        await dbPut(`products/${productId}/stock`, stock.slice(qty));
        for (const content of taken) {
          await dbPush(`products/${productId}/usedStock`, {
            content,
            orderId: "",
            email: user.email || `api:${uid}`,
            date: new Date().toISOString(),
          });
          delivered.push({ title: p.title || "Item", content });
        }
        complete = true;
      }
    }

    const orderId = "API" + Date.now();
    await dbPut(`users/${uid}/wallet`, balance - price);
    await dbPut(`orders/${orderId}`, {
      orderId,
      uid,
      email: user.email || "",
      items: [{ ...p, id: productId, qty, price: Number(p.price || 0) }],
      subTotal: price,
      couponDiscount: 0,
      total: price,
      note: "Placed through reseller API",
      source: "api",
      delivered,
      status: complete ? "Completed" : "Pending",
      date: new Date().toISOString(),
    });
    await dbPush(`users/${uid}/history`, {
      type: "Purchase",
      amount: price,
      desc: `API order ${orderId.slice(-4)}`,
      date: new Date().toISOString(),
    });
    await dbPatch(`products/${productId}`, { salesCount: Number(p.salesCount || 0) + qty });

    return json({
      ok: true,
      orderId,
      status: complete ? "Completed" : "Pending",
      charged: price,
      balance: balance - price,
      delivered,
    });
  }

  return json({ ok: false, error: "Unknown endpoint" }, 404);
}

export const Route = createFileRoute("/api/public/reseller/$")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      GET: async ({ request, params }) => handle(request, String((params as any)._splat || "")),
      POST: async ({ request, params }) => handle(request, String((params as any)._splat || "")),
    },
  },
});
