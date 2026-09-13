import { dbGet, dbPatch, dbPut } from "./telegram.server";

/**
 * Reseller API providers (supplier shops we buy from).
 * Every value here is only a fallback — the admin panel can change the name,
 * base URL, key, profit % and whether a provider is on, in site_settings/providers.
 */
export type ProviderId = "qamify" | "elite" | "eklas" | "safwan" | "mmostore" | "custom";

export type ProviderShape = {
  productsPath: string;
  balancePath: string;
  orderPath: string;
  /** how the order body names its fields */
  qtyField: "qty" | "quantity";
  refField: "idempotency_key" | "client_order_id" | "request_id" | "";
  /** provider needs the Idempotency-Key header instead of a body field */
  idempotencyHeader?: boolean;
  /** extra fields always sent with an order (e.g. currency) */
  orderExtra?: Record<string, unknown>;
};

export type ProviderDef = {
  id: ProviderId;
  name: string;
  url: string;
  key: string;
  docs: string;
  markup: number;
  shape: ProviderShape;
};

export const PROVIDERS: ProviderDef[] = [
  {
    id: "qamify",
    name: "Qamify",
    url: "https://api.qamify.site/v1",
    key: "qamify_bddc9c7e13755ed083264ec1af7be2d6106f5e48e5033b18",
    docs: "https://api.qamify.site/docs",
    markup: 130,
    shape: {
      productsPath: "products",
      balancePath: "balance",
      orderPath: "orders",
      qtyField: "qty",
      refField: "",
      idempotencyHeader: true,
    },
  },
  {
    id: "elite",
    name: "Elite Digital Emporium",
    url: "https://shop.elitedigitalemporium.com/api/telegram-buyer",
    key: "tgb_4ac9c109b339209bb87179fdb3f5e637957797e68528600a",
    docs: "https://shop.elitedigitalemporium.com/api/swagger",
    markup: 130,
    shape: {
      productsPath: "products?per_page=100",
      balancePath: "balance",
      orderPath: "purchase",
      qtyField: "quantity",
      refField: "idempotency_key",
    },
  },
  {
    id: "eklas",
    name: "Eklas ESB",
    url: "https://api-esb.eklas.dev/v1",
    key: "tgb_O0aZZYoosD_gMgAo8DCGcNJyVO7YwrnkpAeRMd4z21z8kXEQ",
    docs: "https://api-esb.eklas.dev/docs",
    markup: 130,
    shape: {
      productsPath: "products",
      balancePath: "balance",
      orderPath: "orders",
      qtyField: "quantity",
      refField: "client_order_id",
    },
  },
  {
    id: "safwan",
    name: "Safwan Tiger Shop",
    url: "https://safwantigershopbot-production.up.railway.app/api",
    key: "stapi_6aaad66227e3c5c8dc6edb3e98d10c684e56cd313b870196ef5d0a71704f14eb",
    docs: "https://safwantigershopbot-production.up.railway.app/api/products",
    markup: 130,
    shape: {
      productsPath: "products",
      balancePath: "balance",
      orderPath: "order",
      qtyField: "quantity",
      refField: "request_id",
    },
  },
  {
    id: "mmostore",
    name: "MMO Store",
    url: "https://api.mmostore.qzz.io/api/v1",
    key: "mmostore_c716a85591c17abfd64c9fce3bb05010ee3ce53336d1da27",
    docs: "https://api.mmostore.qzz.io/apidocumentation",
    markup: 130,
    shape: {
      productsPath: "products",
      balancePath: "balance",
      orderPath: "orders",
      qtyField: "qty",
      refField: "",
      orderExtra: { currency: "USD" },
    },
  },
];

export function providerDef(id: string): ProviderDef | null {
  return PROVIDERS.find((p) => p.id === id) || null;
}

export type ProviderSettings = {
  id: ProviderId;
  name: string;
  url: string;
  key: string;
  docs: string;
  markup: number;
  enabled: boolean;
  shape: ProviderShape;
};

/** Admin-saved settings merged over the built-in fallbacks. */
export async function providerConfig(id: string): Promise<ProviderSettings> {
  const def = providerDef(id);
  const saved = (await dbGet<Record<string, any>>(`site_settings/providers/${id}`)) || {};
  if (id === "custom" || !def) {
    const c = (await dbGet<Record<string, string>>("site_settings/config")) || {};
    return {
      id: "custom",
      name: saved["name"] || "Custom supplier",
      url: String(saved["url"] || c["supplierApiUrl"] || process.env["SUPPLIER_API_URL"] || "").replace(/\/+$/, ""),
      key: String(saved["key"] || c["supplierApiKey"] || process.env["SUPPLIER_API_KEY"] || ""),
      docs: String(saved["docs"] || ""),
      markup: Number(saved["markup"]) || 130,
      enabled: saved["enabled"] !== false,
      shape: {
        productsPath: "products",
        balancePath: "balance",
        orderPath: "order",
        qtyField: "quantity",
        refField: "request_id",
      },
    };
  }
  return {
    id: def.id,
    name: String(saved["name"] || def.name),
    url: String(saved["url"] || def.url).replace(/\/+$/, ""),
    key: String(saved["key"] || def.key),
    docs: String(saved["docs"] || def.docs),
    markup: Number(saved["markup"]) || def.markup,
    enabled: saved["enabled"] !== false,
    shape: def.shape,
  };
}

export async function saveProviderConfig(
  id: string,
  patch: { name?: string; url?: string; key?: string; markup?: number; enabled?: boolean },
): Promise<void> {
  const clean: Record<string, unknown> = {};
  if (patch.name !== undefined) clean["name"] = String(patch.name).trim();
  if (patch.url !== undefined) clean["url"] = String(patch.url).trim().replace(/\/+$/, "");
  if (patch.key !== undefined) clean["key"] = String(patch.key).trim();
  if (patch.markup !== undefined) clean["markup"] = Math.max(100, Number(patch.markup) || 130);
  if (patch.enabled !== undefined) clean["enabled"] = Boolean(patch.enabled);
  await dbPatch(`site_settings/providers/${id}`, clean);
}

/**
 * Only these items are kept from each provider's catalogue.
 * Matching is a case-insensitive "name contains keyword" check.
 * Admin can override the list in site_settings/providers/{id}/keep (array of words).
 */
export const PROVIDER_KEEP: Record<string, string[]> = {
  qamify: ["gemini", "capcut", "duolingo", "perplexity", "leonardo", "linkedin"],
  elite: [
    "autodesk",
    "warp",
    "n8n",
    "lovable",
    "gamma",
    "magic pattern",
    "granola",
    "notion",
    "elevenlab",
    "eleven lab",
    "supabase",
    "gumloop",
    "gemini",
    "google ai pro",
    "google pro ai",
    "runway",
    "intercom",
    "resend",
    "framer",
    "mobbin",
    "chatprd",
    "customer.io",
    "customer io",
    "waking up",
    "readwise",
    "posthog",
    "reclaim",
    "brain.fm",
    "brainfm",
    "jam.dev",
    "jam pro",
    "supercut",
    "pangram",
  ],
  eklas: [
    "miro",
    "chatprd",
    "cursor",
    "factory",
    "manus",
    "posthog",
    "railway",
    "replit",
    "granola",
    "quillbot",
    "elevenlab",
    "eleven lab",
    "framer",
    "supabase",
  ],
  safwan: [
    "gemini",
    "google ai pro",
    "google pro ai",
    "grok",
    "lovable",
    "coursera",
    "capcut",
    "canva",
    "figma",
    "gamma",
    "wispr",
  ],
};

/** Admin-editable keep list for a provider (empty list = keep everything). */
export async function providerKeepList(id: string): Promise<string[]> {
  const saved = await dbGet<string[] | string>(`site_settings/providers/${id}/keep`).catch(
    () => null,
  );
  const list = Array.isArray(saved)
    ? saved
    : typeof saved === "string"
      ? saved.split(",")
      : PROVIDER_KEEP[id] || [];
  return list.map((s) => String(s).toLowerCase().trim()).filter(Boolean);
}

export function keepByList(name: string, keep: string[]): boolean {
  if (!keep.length) return true;
  const n = String(name || "").toLowerCase();
  return keep.some((k) => n.includes(k));
}

export type ApiProduct = {
  id: string | number;
  name: string;
  price: number;
  stock: number;
  unlimited?: boolean;
  description?: string;
  image?: string;
};

function num(v: unknown): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function pickPrice(p: any): number {
  if (p?.price != null && num(p.price) > 0) return num(p.price);
  if (p?.price_usd != null && num(p.price_usd) > 0) return num(p.price_usd);
  if (p?.unit_price != null && num(p.unit_price) > 0) return num(p.unit_price);
  if (p?.price_cents != null) return num(p.price_cents) / 100;
  if (p?.unit_price_cents != null) return num(p.unit_price_cents) / 100;
  return 0;
}

function pickStock(p: any): { stock: number; unlimited: boolean } {
  for (const k of ["stock", "stock_available", "available_stock", "quantity", "stock_count"]) {
    if (p?.[k] != null && p[k] !== "") return { stock: Math.max(0, Math.floor(num(p[k]))), unlimited: false };
  }
  if (p?.unlimited_stock) return { stock: 9999, unlimited: true };
  if (p?.in_stock === true) return { stock: 9999, unlimited: true };
  return { stock: 0, unlimited: false };
}

export function cleanText(s: string): string {
  return String(s || "")
    .replace(/\{\{ce:\d+\|([^}]*)\}\}/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .trim();
}

/** Sell price = supplier price × profit %, rounded up to cents. */
export function sellPrice(supplier: number, markup: number): number {
  const pct = Number(markup) > 0 ? Number(markup) : 130;
  return Math.ceil(Number(supplier || 0) * pct) / 100;
}

async function call(
  cfg: ProviderSettings,
  path: string,
  init?: RequestInit & { idempotency?: string },
): Promise<any> {
  if (!cfg.url || !cfg.key) throw new Error(`${cfg.name}: API address or key is missing`);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${cfg.key}`,
    "x-api-key": cfg.key,
    "X-API-Key": cfg.key,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (init?.idempotency) headers["Idempotency-Key"] = init.idempotency;
  const res = await fetch(`${cfg.url}/${path.replace(/^\/+/, "")}`, {
    method: init?.method || "GET",
    ...(init?.body ? { body: init.body } : {}),
    headers: { ...headers, ...((init?.headers as Record<string, string>) || {}) },
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok || body?.ok === false || body?.success === false) {
    const msg =
      body?.error?.message || body?.error || body?.message || `${cfg.name} error ${res.status}`;
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return body;
}

export async function providerProducts(id: string): Promise<ApiProduct[]> {
  const cfg = await providerConfig(id);
  const body = await call(cfg, cfg.shape.productsPath);
  const list = body?.products || body?.data || body?.items || [];
  return (Array.isArray(list) ? list : []).map((p: any) => {
    const s = pickStock(p);
    const raw = String(p.id ?? "");
    return {
      id: /^\d+$/.test(raw) ? Number(raw) : raw,
      name: String(p.name_en ?? p.name ?? p.title ?? `#${raw}`),
      price: pickPrice(p),
      stock: s.stock,
      unlimited: s.unlimited,
      description: cleanText(String(p.description_en ?? p.description ?? "")),
      image: String(p.image_url ?? p.image ?? p.photo ?? ""),
    };
  });
}

export async function providerBalance(
  id: string,
): Promise<{ balance: number; currency: string }> {
  const cfg = await providerConfig(id);
  const body = await call(cfg, cfg.shape.balancePath);
  const w = body?.wallet || body?.data || body;
  const balance =
    w?.balance != null
      ? num(w.balance)
      : w?.balance_usd != null
        ? num(w.balance_usd)
        : w?.balance_cents != null
          ? num(w.balance_cents) / 100
          : 0;
  return { balance, currency: String(w?.currency || body?.currency || "USD") };
}

function collectItems(body: any): string[] {
  const out: string[] = [];
  const seen = new Set<any>();
  const keys = /^(items|credentials|codes|keys|delivered|deliveries|content|contents|accounts|lines)$/i;
  const walk = (node: any, keyed: boolean) => {
    if (node == null || out.length > 200) return;
    if (typeof node === "string") {
      if (keyed && node.trim()) out.push(node.trim());
      return;
    }
    if (Array.isArray(node)) {
      for (const it of node) {
        if (typeof it === "string") {
          if (keyed && it.trim()) out.push(it.trim());
        } else if (it && typeof it === "object") {
          const v =
            it.content ?? it.credential ?? it.code ?? it.key ?? it.data ?? it.item ?? it.value ?? it.text;
          if (typeof v === "string" && v.trim()) out.push(v.trim());
          else walk(it, keyed);
        }
      }
      return;
    }
    if (typeof node === "object") {
      if (seen.has(node)) return;
      seen.add(node);
      for (const [k, v] of Object.entries(node)) walk(v, keyed || keys.test(k));
    }
  };
  walk(body, false);
  return [...new Set(out)];
}

/** Buy from a provider and return the delivered lines. */
export async function providerBuy(
  id: string,
  productId: string | number,
  qty: number,
  reference: string,
): Promise<string[]> {
  const cfg = await providerConfig(id);
  if (!cfg.enabled) throw new Error(`${cfg.name} is turned off`);
  const raw = String(productId);
  const body: Record<string, unknown> = {
    product_id: /^\d+$/.test(raw) ? Number(raw) : raw,
    [cfg.shape.qtyField]: Math.max(1, Number(qty) || 1),
    ...(cfg.shape.orderExtra || {}),
  };
  if (cfg.shape.refField) body[cfg.shape.refField] = reference;
  const res = await call(cfg, cfg.shape.orderPath, {
    method: "POST",
    body: JSON.stringify(body),
    ...(cfg.shape.idempotencyHeader ? { idempotency: reference } : {}),
  });
  const lines = collectItems(res);
  if (!lines.length) throw new Error(`${cfg.name} did not return any item`);
  return lines;
}

/** Firebase-safe product key for an imported provider item. */
export function apiProductKey(provider: string, id: string | number): string {
  return `api_${provider}_${String(id).replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/** Category (folder) the imported API products live in, created if missing. */
export async function apiCategoryName(): Promise<string> {
  const c = (await dbGet<Record<string, any>>("site_settings/config")) || {};
  const label = String(c["apiCategory"] || "Reseller API");
  const cats = Array.isArray(c["categories"]) ? c["categories"] : [];
  if (!cats.some((x: any) => String(x?.label || "") === label)) {
    await dbPatch("site_settings/config", {
      categories: [...cats, { label, icon: "🔑" }],
    });
  }
  return label;
}

/**
 * Import every product of a provider into the shop.
 * Existing items are refreshed (price/stock/description) and keep their
 * profit % and hidden flag. Imported products are locked (cannot be deleted).
 */
export async function importProvider(
  id: string,
): Promise<{ added: number; updated: number; removed: number }> {
  const cfg = await providerConfig(id);
  const [all, existing, category, keep] = await Promise.all([
    providerProducts(id),
    dbGet<Record<string, any>>("products"),
    apiCategoryName(),
    providerKeepList(id),
  ]);
  const list = all.filter((p) => keepByList(p.name, keep));
  const wanted = new Set(list.map((p) => apiProductKey(cfg.id, p.id)));
  let added = 0;
  let updated = 0;
  let removed = 0;

  // Drop anything from this provider that is no longer on the keep list.
  for (const [key, p] of Object.entries(existing || {})) {
    if (!p || p.delivery !== "supplier") continue;
    if (String(p.provider || "custom") !== cfg.id) continue;
    if (wanted.has(key)) continue;
    await dbPut(`products/${key}`, null);
    removed++;
  }

  for (const sp of list) {
    const key = apiProductKey(cfg.id, sp.id);
    const cur = (existing || {})[key];
    const markup = Number(cur?.markup) || cfg.markup;
    const base = {
      delivery: "supplier" as const,
      provider: cfg.id,
      providerName: cfg.name,
      supplierId: sp.id,
      markup,
      price: sellPrice(sp.price, markup),
      supplierPrice: sp.price,
      supplierStock: sp.unlimited ? 9999 : sp.stock,
      supplierSyncedAt: new Date().toISOString(),
      locked: true,
    };
    if (cur) {
      // Keep whatever the admin renamed / re-categorised / re-imaged.
      await dbPatch(`products/${key}`, {
        ...base,
        ...(cur.title ? {} : { title: sp.name }),
        ...(cur.desc ? {} : { desc: sp.description || "" }),
        ...(cur.type ? {} : { type: category }),
        ...(cur.logo || !sp.image ? {} : { logo: sp.image }),
      });
      updated++;
    } else {
      await dbPut(`products/${key}`, {
        ...base,
        title: sp.name,
        desc: sp.description || "",
        type: category,
        ...(sp.image ? { logo: sp.image } : {}),
        hidden: true,
        salesCount: 0,
      });
      added++;
    }
  }

  await dbPatch(`site_settings/providers/${cfg.id}`, {
    imported_at: new Date().toISOString(),
    imported_count: list.length,
  });
  return { added, updated, removed };
}

/** Delete every imported API product that is not on its provider's keep list. */
export async function pruneImportedProducts(): Promise<{
  removed: number;
  kept: number;
  titles: string[];
}> {
  const products = (await dbGet<Record<string, any>>("products")) || {};
  const keeps = new Map<string, string[]>();
  let removed = 0;
  let kept = 0;
  const titles: string[] = [];
  for (const [key, p] of Object.entries(products)) {
    if (!p || p.delivery !== "supplier") continue;
    const pid = String(p.provider || "custom");
    if (!keeps.has(pid)) keeps.set(pid, await providerKeepList(pid));
    const name = `${p.title || ""} ${p.desc || ""}`;
    if (keepByList(name, keeps.get(pid) || [])) {
      kept++;
      continue;
    }
    await dbPut(`products/${key}`, null);
    titles.push(String(p.title || key));
    removed++;
  }
  return { removed, kept, titles };
}


/** Refresh price and stock of every linked product, per provider. */
export async function syncAllProviders(force = true): Promise<{
  updated: { id: string; title: string; price: number; stock: number }[];
}> {
  if (!force) {
    const last = await dbGet<string>("site_settings/supplier_synced_at");
    if (last && Date.now() - new Date(last).getTime() < 5 * 60 * 1000) return { updated: [] };
  }
  await dbPatch("site_settings", { supplier_synced_at: new Date().toISOString() });

  const products = (await dbGet<Record<string, any>>("products")) || {};
  const linked = Object.entries(products).filter(
    ([, p]) => p && p.delivery === "supplier" && Number(p.supplierId || 0) > 0,
  );
  const providers = [...new Set(linked.map(([, p]) => String(p.provider || "custom")))];
  const catalogues = new Map<string, Map<number, ApiProduct>>();
  await Promise.all(
    providers.map(async (pid) => {
      try {
        const items = await providerProducts(pid);
        catalogues.set(pid, new Map(items.map((i) => [i.id, i])));
      } catch {
        /* provider down — keep old values */
      }
    }),
  );

  const updated: { id: string; title: string; price: number; stock: number }[] = [];
  for (const [id, p] of linked) {
    const cat = catalogues.get(String(p.provider || "custom"));
    const sp = cat?.get(Number(p.supplierId));
    if (!sp) continue;
    const price = sellPrice(sp.price, Number(p.markup) || 130);
    const stock = sp.unlimited ? 9999 : Math.max(0, sp.stock);
    const wasOut = Number(p.supplierStock ?? 0) <= 0;
    await dbPatch(`products/${id}`, {
      price,
      supplierPrice: sp.price,
      supplierStock: stock,
      supplierSyncedAt: new Date().toISOString(),
    });
    // Back in stock at the provider: tell every bot user.
    if (wasOut && stock > 0 && !p.hidden) {
      const { announce } = await import("./broadcast.server");
      await announce("restock", id, { left: stock }).catch(() => undefined);
    }
    updated.push({ id, title: String(p.title || sp.name), price, stock });
  }
  return { updated };
}
