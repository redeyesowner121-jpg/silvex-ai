import { dbGet, dbPatch } from "./telegram.server";

/**
 * Supplier shop connection (reseller API of another store).
 * The address and key are set in the admin panel (site_settings/config) and
 * fall back to project secrets, so nothing is hardcoded here.
 */
export type SupplierProduct = {
  id: number;
  name: string;
  price: number;
  stock: number;
  available?: boolean;
  unlimited_stock?: boolean;
  description?: string;
  warranty?: string;
};

async function creds(): Promise<{ url: string; key: string }> {
  const c = (await dbGet<Record<string, string>>("site_settings/config")) || {};
  const url = (c["supplierApiUrl"] || process.env["SUPPLIER_API_URL"] || "").replace(/\/+$/, "");
  const key = c["supplierApiKey"] || process.env["SUPPLIER_API_KEY"] || "";
  return { url, key };
}

async function call(path: string, init?: RequestInit): Promise<any> {
  const { url, key } = await creds();
  if (!url || !key) throw new Error("Supplier API is not set up in the admin panel");
  const res = await fetch(`${url}/${path.replace(/^\/+/, "")}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "x-api-key": key,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok || body?.ok === false) {
    throw new Error(body?.error || body?.message || `Supplier API error ${res.status}`);
  }
  return body;
}

export async function supplierProducts(): Promise<SupplierProduct[]> {
  const body = await call("products");
  const list = body?.products || body?.data || [];
  return (Array.isArray(list) ? list : []).map((p: any) => ({
    id: Number(p.id),
    name: String(p.name ?? p.title ?? `#${p.id}`),
    price: Number(p.price ?? 0),
    stock: Number(p.stock ?? 0),
    available: p.available !== false,
    unlimited_stock: Boolean(p.unlimited_stock),
    description: String(p.description ?? ""),
    warranty: String(p.warranty ?? ""),
  }));
}

export async function supplierBalance(): Promise<{ balance: number; currency: string }> {
  const body = await call("balance");
  return { balance: Number(body?.balance ?? 0), currency: String(body?.currency || "USDT") };
}

/** Strip supplier markup like custom-emoji tags and HTML from a description. */
export function cleanText(s: string): string {
  return String(s || "")
    .replace(/\{\{ce:\d+\|([^}]*)\}\}/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Sell price = supplier price × markup%, rounded up to 2 decimals. */
export function sellPrice(supplier: number, markup: number): number {
  const pct = Number(markup) > 0 ? Number(markup) : 100;
  return Math.ceil(Number(supplier || 0) * pct) / 100;
}

/**
 * Refresh price and stock of every product linked to the supplier.
 * Returns the products that changed.
 */
export async function syncSupplierProducts(): Promise<{
  updated: { id: string; title: string; price: number; stock: number }[];
}> {
  const [products, list] = await Promise.all([
    dbGet<Record<string, any>>("products"),
    supplierProducts(),
  ]);
  const bySupplier = new Map(list.map((p) => [p.id, p]));
  const updated: { id: string; title: string; price: number; stock: number }[] = [];
  for (const [id, p] of Object.entries(products || {})) {
    const sid = Number((p as any)?.supplierId || 0);
    if (!sid) continue;
    const sp = bySupplier.get(sid);
    if (!sp) continue;
    const price = sellPrice(sp.price, Number((p as any).markup) || 100);
    const stock = sp.unlimited_stock ? 9999 : Math.max(0, sp.stock);
    await dbPatch(`products/${id}`, {
      price,
      supplierPrice: sp.price,
      supplierStock: stock,
      supplierSyncedAt: new Date().toISOString(),
    });
    updated.push({ id, title: String((p as any).title || sp.name), price, stock });
  }
  return { updated };
}

/** Buy from the supplier and return the delivered lines. */
export async function supplierBuy(
  supplierId: number,
  qty: number,
  requestId: string,
): Promise<string[]> {
  const body = await call("order", {
    method: "POST",
    body: JSON.stringify({ product_id: Number(supplierId), quantity: Number(qty) || 1, request_id: requestId }),
  });
  const raw =
    body?.items ??
    body?.delivered ??
    body?.data?.items ??
    body?.order?.items ??
    body?.products ??
    body?.content ??
    [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const lines = arr
    .map((it: any) =>
      typeof it === "string"
        ? it
        : String(it?.content ?? it?.data ?? it?.item ?? it?.value ?? JSON.stringify(it)),
    )
    .map((s) => s.trim())
    .filter(Boolean);
  if (!lines.length) throw new Error("Supplier did not return any item");
  return lines;
}
