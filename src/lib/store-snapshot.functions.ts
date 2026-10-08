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


export const getStoreSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { storeSnapshot } = await import("./store-snapshot.server");
  return storeSnapshot();
});
