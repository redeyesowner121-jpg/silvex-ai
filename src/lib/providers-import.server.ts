/** Importing, pruning and syncing supplier shop products. */
import { dbGet, dbPatch, dbPut } from "./telegram.server";
import {
  PROVIDERS,
  RETIRED_PROVIDERS,
  apiCategoryName,
  apiProductKey,
  cleanText,
  keepByList,
  providerConfig,
  providerKeepList,
  providerProducts,
  sellPrice,
  type ApiProduct,
} from "./providers.server";

/**
 * Import every product of a provider into the shop.
 * Existing items are refreshed (price/stock/description) and keep their
 * profit % and hidden flag. Imported products are locked (cannot be deleted).
 */
export async function importProvider(
  id: string,
): Promise<{ added: number; updated: number; removed: number }> {
  const cfg = await providerConfig(id);
  const [all, existing, category, keep, deleted] = await Promise.all([
    providerProducts(id),
    dbGet<Record<string, any>>("products"),
    apiCategoryName(),
    providerKeepList(id),
    dbGet<Record<string, boolean>>("site_settings/apiDeleted").catch(() => null),
  ]);
  // Items the admin deleted by hand never come back on the next import.
  const list = all.filter(
    (p) => keepByList(p.name, keep) && !(deleted || {})[apiProductKey(cfg.id, p.id)],
  );
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
    if (RETIRED_PROVIDERS.includes(pid)) {
      await dbPut(`products/${key}`, null);
      titles.push(String(p.title || key));
      removed++;
      continue;
    }
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
  const deleted = (await dbGet<Record<string, boolean>>("site_settings/apiDeleted").catch(() => null)) || {};
  // Ghost rows (deleted mid-sync: price only, no title) are cleaned up, never refreshed.
  for (const [id, p] of Object.entries(products)) {
    if (p && String(p.title || "").trim() === "" && String(p.delivery || "") !== "manual") {
      await dbPut(`products/${id}`, null);
      delete (products as any)[id];
    }
  }
  const linked = Object.entries(products).filter(
    ([id, p]) =>
      p &&
      p.delivery === "supplier" &&
      String(p.supplierId ?? "").trim() !== "" &&
      !deleted[id],
  );
  const providers = [...new Set(linked.map(([, p]) => String(p.provider || "custom")))];
  const catalogues = new Map<string, Map<string, ApiProduct>>();
  await Promise.all(
    providers.map(async (pid) => {
      try {
        const items = await providerProducts(pid);
        catalogues.set(pid, new Map(items.map((i) => [String(i.id), i])));
      } catch {
        /* provider down — keep old values */
      }
    }),
  );

  const updated: { id: string; title: string; price: number; stock: number }[] = [];
  for (const [id, p] of linked) {
    const cat = catalogues.get(String(p.provider || "custom"));
    const sp = cat?.get(String(p.supplierId));
    if (!sp) continue;
    const price = sellPrice(sp.price, Number(p.markup) || 130);
    const stock = sp.unlimited ? 9999 : Math.max(0, sp.stock);
    const wasOut = Number(p.supplierStock ?? 0) <= 0;
    const desc = String(sp.description || "").trim();
    await dbPatch(`products/${id}`, {
      price,
      supplierPrice: sp.price,
      supplierStock: stock,
      supplierSyncedAt: new Date().toISOString(),
      // Keep the shop description in step with the supplier's own text,
      // unless the admin wrote their own (descEdited).
      ...(desc && !p.descEdited ? { desc } : {}),
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
