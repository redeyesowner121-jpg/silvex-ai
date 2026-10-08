/**
 * Drop-in replacement for the few "@/lib/fb/database" calls the website uses.
 * Every read/write goes to Lovable Cloud through server functions that apply
 * the store's access rules. Live listeners are refreshed by polling.
 */
import { cloudRead, cloudWrite } from "@/lib/clouddb.functions";

export type Database = { readonly kind: "cloud-db" };
export const theDb: Database = { kind: "cloud-db" };
export function getDatabase(_app?: unknown): Database {
  return theDb;
}

const norm = (p: string) => p.split("/").filter(Boolean).join("/");

export interface DatabaseReference {
  readonly path: string;
  readonly key: string | null;
}
export interface Query {
  readonly path: string;
  readonly key: string | null;
  readonly child?: string;
  readonly equalTo?: unknown;
}

export function ref(_db: Database, path = ""): DatabaseReference {
  const p = norm(path);
  return { path: p, key: p ? p.split("/").pop()! : null };
}

type Constraint = { child?: string; equalTo?: unknown };
export function orderByChild(child: string): Constraint {
  return { child };
}
export function equalTo(value: unknown): Constraint {
  return { equalTo: value };
}
export function query(r: DatabaseReference, ...cs: Constraint[]): Query {
  return Object.assign({ path: r.path, key: r.key }, ...cs);
}

export class DataSnapshot {
  constructor(
    public readonly key: string | null,
    private readonly data: any,
  ) {}
  val(): any {
    return this.data === undefined ? null : this.data;
  }
  exists(): boolean {
    return this.data !== null && this.data !== undefined;
  }
  get size(): number {
    return this.data && typeof this.data === "object" ? Object.keys(this.data).length : 0;
  }
  hasChildren(): boolean {
    return this.size > 0;
  }
  child(p: string): DataSnapshot {
    let cur = this.data;
    for (const s of norm(p).split("/")) cur = cur && typeof cur === "object" ? cur[s] : null;
    return new DataSnapshot(norm(p).split("/").pop() || null, cur ?? null);
  }
  forEach(cb: (s: DataSnapshot) => boolean | void): boolean {
    if (!this.data || typeof this.data !== "object") return false;
    for (const [k, v] of Object.entries(this.data)) if (cb(new DataSnapshot(k, v)) === true) return true;
    return false;
  }
  toJSON() {
    return this.val();
  }
}

async function readRaw(q: Query): Promise<any> {
  const res = await cloudRead({
    data: { path: q.path, ...(q.child !== undefined ? { child: q.child, equalTo: q.equalTo } : {}) },
  });
  return res.value;
}

export async function get(q: Query | DatabaseReference): Promise<DataSnapshot> {
  return new DataSnapshot(q.key, await readRaw(q));
}

function touched(path: string) {
  for (const l of listeners) {
    if (l.q.path === "" || path === "" || path.startsWith(l.q.path) || l.q.path.startsWith(path)) void l.poll(true);
  }
}

export async function set(r: DatabaseReference, value: unknown): Promise<void> {
  await cloudWrite({ data: { op: value === null ? "remove" : "set", path: r.path, value: value ?? null } });
  touched(r.path);
}

export async function update(r: DatabaseReference, value: Record<string, unknown>): Promise<void> {
  await cloudWrite({ data: { op: "update", path: r.path, value } });
  touched(r.path);
}

export async function remove(r: DatabaseReference): Promise<void> {
  await cloudWrite({ data: { op: "remove", path: r.path } });
  touched(r.path);
}

let lastPush = 0;
let seq = 0;
function pushKey(): string {
  const now = Date.now();
  seq = now === lastPush ? seq + 1 : 0;
  lastPush = now;
  return `-${now.toString(36).padStart(9, "0")}${seq.toString(36).padStart(2, "0")}${Math.random().toString(36).slice(2, 10).padEnd(8, "0")}`;
}

export type ThenableReference = DatabaseReference & Promise<DatabaseReference>;
export function push(r: DatabaseReference, value?: unknown): ThenableReference {
  const child = ref(theDb, `${r.path}/${pushKey()}`);
  const done = value === undefined ? Promise.resolve(child) : set(child, value).then(() => child);
  return Object.assign(done, child) as ThenableReference;
}

/* ---------------- live listeners (polling) ---------------- */

type Listener = { q: Query; poll: (force?: boolean) => Promise<void> };
const listeners = new Set<Listener>();

function intervalFor(path: string): number {
  if (path.startsWith("telegramEmoji") || path.startsWith("site_settings")) return 60_000;
  if (path.startsWith("notifications")) return 30_000;
  return 8_000;
}

export type Unsubscribe = () => void;
export function onValue(
  q: Query | DatabaseReference,
  cb: (s: DataSnapshot) => void,
  onError?: ((e: Error) => void) | { onlyOnce?: boolean },
): Unsubscribe {
  let stopped = false;
  let last: string | undefined;
  let busy = false;
  const errCb = typeof onError === "function" ? onError : undefined;
  const l: Listener = {
    q,
    poll: async (force = false) => {
      if (stopped || busy) return;
      if (!force && typeof document !== "undefined" && document.hidden) return;
      busy = true;
      try {
        const v = await readRaw(q);
        const s = JSON.stringify(v ?? null);
        if (s !== last) {
          last = s;
          if (!stopped) cb(new DataSnapshot(q.key, v ?? null));
        }
      } catch (e) {
        if (!stopped && errCb) errCb(e as Error);
      } finally {
        busy = false;
      }
    },
  };
  listeners.add(l);
  void l.poll(true);
  const timer = setInterval(() => void l.poll(), intervalFor(q.path));
  return () => {
    stopped = true;
    clearInterval(timer);
    listeners.delete(l);
  };
}

/** Re-read every live listener now (after sign-in / sign-out). */
export function refreshAllListeners() {
  for (const l of listeners) void l.poll(true);
}
