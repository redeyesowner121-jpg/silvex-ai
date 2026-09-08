import { createServerFn } from "@tanstack/react-start";

/** Supplier catalogue, shown in the admin panel when linking a product. */
export const fetchSupplierCatalogue = createServerFn({ method: "GET" }).handler(async () => {
  const { supplierProducts, supplierBalance, cleanText } = await import("./supplier.server");
  try {
    const [products, balance] = await Promise.all([
      supplierProducts(),
      supplierBalance().catch(() => ({ balance: 0, currency: "USDT" })),
    ]);
    return {
      ok: true as const,
      balance,
      products: products.map((p) => ({ ...p, description: cleanText(p.description || "") })),
    };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message, products: [], balance: null };
  }
});

/** Refresh prices and stock of all linked products from the supplier. */
export const syncSupplier = createServerFn({ method: "POST" }).handler(async () => {
  const { syncSupplierProducts } = await import("./supplier.server");
  try {
    return { ok: true as const, ...(await syncSupplierProducts()) };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message, updated: [] };
  }
});

/** Buy a linked product from the supplier and get the delivery lines back. */
export const buyFromSupplier = createServerFn({ method: "POST" })
  .inputValidator((input: { productId: string; qty?: number; orderId?: string }) => input)
  .handler(async ({ data }) => {
    const { dbGet } = await import("./telegram.server");
    const { supplierBuy } = await import("./supplier.server");
    try {
      const p = await dbGet<any>(`products/${data.productId}`);
      const sid = Number(p?.supplierId || 0);
      if (!sid) return { ok: false as const, error: "This product is not linked to the supplier", items: [] };
      const qty = Math.max(1, Math.min(20, Number(data.qty) || 1));
      const items = await supplierBuy(sid, qty, data.orderId || `req-${Date.now()}`);
      return { ok: true as const, items };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message, items: [] };
    }
  });

/** Cheap background refresh (runs at most once every 5 minutes). */
export const autoSyncSupplier = createServerFn({ method: "POST" }).handler(async () => {
  const { syncSupplierProducts } = await import("./supplier.server");
  try {
    return { ok: true as const, ...(await syncSupplierProducts(false)) };
  } catch {
    return { ok: false as const, updated: [] };
  }
});
