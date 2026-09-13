/**
 * Supplier helpers.
 * Everything now goes through the multi-provider registry in providers.server.ts;
 * these thin wrappers keep the older "custom supplier" call sites working.
 */
export {
  cleanText,
  sellPrice,
  providerBuy,
  providerProducts,
  providerBalance,
} from "./providers.server";
export type { ApiProduct as SupplierProduct } from "./providers.server";

import { providerProducts, providerBalance, providerBuy, syncAllProviders } from "./providers.server";

export async function supplierProducts() {
  return providerProducts("custom");
}

export async function supplierBalance() {
  return providerBalance("custom");
}

export async function syncSupplierProducts(force = true) {
  return syncAllProviders(force);
}

/** Buy one linked product. `provider` defaults to the custom supplier shop. */
export async function supplierBuy(
  supplierId: string | number,
  qty: number,
  requestId: string,
  provider = "custom",
): Promise<string[]> {
  return providerBuy(provider, supplierId, qty, requestId);
}
