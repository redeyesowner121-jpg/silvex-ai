import { createServerFn } from "@tanstack/react-start";

/**
 * A light copy of the shop data (products, settings, banner, flash sale) that
 * travels with the page HTML, so the homepage shows products on first paint
 * instead of waiting for the Firebase connection in the browser.
 */
export type StoreSnapshot = {
  products: Record<string, any>;
  config: Record<string, any>;
  banner: Record<string, any>;
  flashSale: any;
  emojis: Record<string, any>;
  prodEmojis: Record<string, any>;
};

const EMPTY: StoreSnapshot = {
  products: {},
  config: {},
  banner: {},
  flashSale: null,
  emojis: {},
  prodEmojis: {},
};

let cache: { at: number; data: StoreSnapshot } | null = null;
const TTL = 20_000;

function dbUrl() {
  const projectId = process.env["FIREBASE_PROJECT_ID"] || "silvex-ai";
  return (
    process.env["FIREBASE_DATABASE_URL"] || `https://${projectId}-default-rtdb.firebaseio.com`
  ).replace(/\/+$/, "");
}

async function read(path: string) {
  try {
    const cdb = await import("./cloud-db.server");
    if (cdb.usingCloud()) return await cdb.cloudGet(path);
    const res = await fetch(`${dbUrl()}/${path}.json`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Secret settings (bot token, payment and supplier keys) never leave the server.
const SECRET_CONFIG = /(secret|token|apikey|password|smtp)/i;
const SECRET_EXTRA = new Set(["supplierApiUrl", "notifyGroup", "telegramOwners"]);
function publicConfig(c: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries((c || {}) as Record<string, any>)) {
    if (SECRET_CONFIG.test(k) || SECRET_EXTRA.has(k)) continue;
    out[k] = v;
  }
  return out;
}

let loading: Promise<StoreSnapshot> | null = null;

async function build(): Promise<StoreSnapshot> {
  const [rawProducts, config, banner, flashSale, emojis, prodEmojis] = await Promise.all([
    read("products"),
    read("site_settings/config"),
    read("site_settings/banner"),
    read("site_settings/flash_sale"),
    read("telegramEmoji/slots"),
    read("telegramEmoji/products"),
  ]);

  // Stock lists and delivered-stock records are admin-only and can be large.
  const products: Record<string, any> = {};
  for (const [id, p] of Object.entries((rawProducts || {}) as Record<string, any>)) {
    if (!p || typeof p !== "object") continue;
    const { stock, usedStock, ...rest } = p as Record<string, any>;
    const left = Array.isArray(stock) ? stock.filter(Boolean).length : 0;
    if (typeof rest["logo"] === "string" && (rest["logo"] as string).startsWith("data:")) {
      rest["logo"] = `/api/public/product-img/${id}`;
    }
    products[id] = left ? { ...rest, stock: Array.from({ length: left }, () => "1") } : rest;
  }

  const data: StoreSnapshot = {
    ...EMPTY,
    products,
    config: publicConfig(config),
    banner: banner || {},
    flashSale: flashSale || null,
    emojis: emojis || {},
    prodEmojis: prodEmojis || {},
  };
  // Don't replace good data with an empty result from a failed read.
  if (rawProducts || !cache) cache = { at: Date.now(), data };
  return cache.data;
}

function refresh() {
  loading ||= build().finally(() => {
    loading = null;
  });
  return loading;
}

// Warm the copy as soon as the server starts.
void refresh().catch(() => undefined);

export const getStoreSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  // Serve the saved copy instantly and refresh it in the background when old.
  if (cache) {
    if (Date.now() - cache.at >= TTL) void refresh().catch(() => undefined);
    return cache.data;
  }
  return refresh();
});
