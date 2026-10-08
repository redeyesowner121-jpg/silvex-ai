/**
 * Website data + logins. The old Firebase backend is gone: this now hands out
 * Lovable Cloud versions of the same calls, so existing pages keep working.
 */
import { getAuth, type Auth } from "./fb/auth";
import { getDatabase, type Database } from "./fb/database";

export type FirebaseBundle = { app: null; auth: Auth; db: Database };

const bundle: FirebaseBundle = { app: null, auth: getAuth(), db: getDatabase() };

export function getFirebase(): Promise<FirebaseBundle> {
  return Promise.resolve(bundle);
}
