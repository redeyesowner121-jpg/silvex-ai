import type { StoreSnapshot } from "@/lib/store-snapshot.functions";

/** Shop data sent with the page HTML, used as the store's first state. */
let snapshot: StoreSnapshot | null = null;

export function primeStoreSnapshot(data?: StoreSnapshot | null) {
  if (data && typeof data === "object") snapshot = data;
}

export function readStoreSnapshot(): StoreSnapshot | null {
  return snapshot;
}
