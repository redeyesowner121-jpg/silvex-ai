import { createServerFn } from "@tanstack/react-start";

/** All reseller API providers with their settings and live balance. */
export const listProviders = createServerFn({ method: "GET" }).handler(async () => {
  const { PROVIDERS, providerConfig, providerBalance } = await import("./providers.server");
  const ids = [...PROVIDERS.map((p) => p.id), "custom" as const];
  const rows = await Promise.all(
    ids.map(async (id) => {
      const cfg = await providerConfig(id);
      const balance = await providerBalance(id).catch(() => null);
      return {
        id: cfg.id,
        name: cfg.name,
        url: cfg.url,
        key: cfg.key,
        docs: cfg.docs,
        markup: cfg.markup,
        enabled: cfg.enabled,
        balance: balance ? balance.balance : null,
        currency: balance ? balance.currency : "USD",
      };
    }),
  );
  return { ok: true as const, providers: rows };
});

/** Save one provider's address, key, profit % or on/off state. */
export const saveProvider = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      id: string;
      name?: string;
      url?: string;
      key?: string;
      markup?: number;
      enabled?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { saveProviderConfig } = await import("./providers.server");
    try {
      const { id, ...patch } = data;
      await saveProviderConfig(id, patch);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message };
    }
  });

/** Pull every product of a provider into the shop folder (hidden by default). */
export const importProviderProducts = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { importProvider } = await import("./providers.server");
    try {
      return { ok: true as const, ...(await importProvider(data.id)) };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message, added: 0, updated: 0 };
    }
  });

/** Live catalogue of one provider (used for previews). */
export const fetchProviderProducts = createServerFn({ method: "POST" })
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data }) => {
    const { providerProducts } = await import("./providers.server");
    try {
      return { ok: true as const, products: await providerProducts(data.id) };
    } catch (err) {
      return { ok: false as const, error: (err as Error).message, products: [] };
    }
  });
