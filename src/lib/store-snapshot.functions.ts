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
    const res = await fetch(`${dbUrl()}/${path}.json`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const getStoreSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  if (cache && Date.now() - cache.at < TTL) return cache.data;

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
    // Keep only how many are left, not the secret stock lines themselves.
    const left = Array.isArray(stock) ? stock.filter(Boolean).length : 0;
    products[id] = left ? { ...rest, stock: Array.from({ length: left }, () => "1") } : rest;
  }

  const data: StoreSnapshot = {
    ...EMPTY,
    products,
    config: config || {},
    banner: banner || {},
    flashSale: flashSale || null,
    emojis: emojis || {},
    prodEmojis: prodEmojis || {},
  };
  cache = { at: Date.now(), data };
  return data;
});
