/**
 * Who is calling, and what may they read or write?
 * Replaces the old Firebase security rules with the same rules in code.
 */
import { PERMANENT_OWNER_EMAILS } from "./owners";

export type Caller = { authId: string; uid: string; email: string; staff: boolean } | null;

async function admin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

const cache = new Map<string, { at: number; caller: Caller }>();

/** Turns a login token into the customer it belongs to (null when signed out). */
export async function callerFromToken(token: string | null | undefined): Promise<Caller> {
  if (!token) return null;
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < 60_000) return hit.caller;
  const db = await admin();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const user = data.user;
  const email = String(user.email || "").toLowerCase();
  let { data: cust } = await db.from("customers").select("id, legacy_uid").eq("auth_user_id", user.id).maybeSingle();
  if (!cust) {
    // Signup trigger normally does this; make sure every login has a customer.
    const { data: made } = await db
      .from("customers")
      .insert({ auth_user_id: user.id, legacy_uid: user.id, email, name: user.user_metadata?.name || email.split("@")[0] || "User", source: "web" })
      .select("id, legacy_uid")
      .maybeSingle();
    cust = made;
  }
  if (cust && !cust.legacy_uid) {
    await db.from("customers").update({ legacy_uid: user.id }).eq("id", cust.id);
    cust.legacy_uid = user.id;
  }
  const { data: roles } = await db.from("user_roles").select("role").eq("user_id", user.id);
  const hasRole = (roles || []).some((r: any) => r.role === "owner" || r.role === "admin");
  const owners = PERMANENT_OWNER_EMAILS.map((e) => e.toLowerCase());
  const caller: Caller = { authId: user.id, uid: cust?.legacy_uid || user.id, email, staff: hasRole && owners.includes(email) };
  cache.set(token, { at: Date.now(), caller });
  return caller;
}

const parts = (p: string) => p.split("/").filter(Boolean);
const PUBLIC_SETTINGS = new Set(["banner", "flash_sale", "button_colors"]);
const OWN_FIELDS = new Set(["name", "phone", "email", "joined", "myRefCode", "source", "alerts", "apiKey", "apiEnabled", "telegramChatId", "pushSubs"]);

export function canRead(path: string, c: Caller): boolean {
  if (c?.staff) return true;
  const [a, b, x, y] = parts(path);
  if (a === "telegramEmoji" || a === "notifications") return true;
  if (a === "site_settings" && b && PUBLIC_SETTINGS.has(b)) return true;
  if (a === "products" && b && x === "reviews") return true;
  if (a === "users" && b && c && b === c.uid) return true;
  void y;
  return false;
}

/** Returns a reason when the write is not allowed. */
export function writeProblem(op: string, path: string, value: any, current: any, c: Caller): string | null {
  if (c?.staff) return null;
  if (!c) return "Please log in";
  const [a, b, x, y] = parts(path);
  if (a === "users" && b === c.uid) {
    if (!x) {
      if (op === "remove") return "Not allowed";
      const keys = Object.keys(value || {}).map((k) => k.split("/")[0]!);
      return keys.every((k) => OWN_FIELDS.has(k)) ? null : "Not allowed";
    }
    return OWN_FIELDS.has(x) ? null : "Not allowed";
  }
  if (a === "products" && b && x === "reviews" && y) return current === null && op !== "remove" ? null : "Not allowed";
  if (a === "requests" && b && !x) {
    if (current !== null || op === "remove") return "Not allowed";
    return value?.uid === c.uid ? null : "Not allowed";
  }
  if (a === "apiKeys" && b && !x) {
    if (current === null && value === c.uid) return null;
    if (current === c.uid && (value === null || op === "remove")) return null;
    return "Not allowed";
  }
  return "Not allowed";
}
