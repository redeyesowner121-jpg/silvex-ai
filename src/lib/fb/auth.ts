/**
 * Drop-in replacement for the "@/lib/fb/auth" calls the website uses,
 * backed by Lovable Cloud logins. `user.uid` is the customer's store id.
 */
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { cloudWhoami, prepareLegacyLogin } from "@/lib/clouddb.functions";
import { refreshAllListeners } from "./database";

export interface UserInfo {
  providerId: string;
}
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  providerData: UserInfo[];
  getIdToken: (forceRefresh?: boolean) => Promise<string>;
  reload: () => Promise<void>;
}
export interface UserCredential {
  user: User;
}
export interface Auth {
  currentUser: User | null;
}

const theAuth: Auth = { currentUser: null };
export function getAuth(_app?: unknown): Auth {
  return theAuth;
}

class AuthError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function mapError(e: { message?: string; status?: number } | null): AuthError {
  const m = String(e?.message || "Something went wrong");
  if (/invalid login|invalid credentials/i.test(m)) return new AuthError("auth/invalid-credential", m);
  if (/already registered|already exists/i.test(m)) return new AuthError("auth/email-already-in-use", m);
  if (/password.*(short|least|weak)/i.test(m)) return new AuthError("auth/weak-password", m);
  if (/rate|too many/i.test(m) || e?.status === 429) return new AuthError("auth/too-many-requests", m);
  if (/not confirmed/i.test(m)) return new AuthError("auth/email-not-verified", "Please confirm your email first — check your inbox.");
  return new AuthError("auth/error", m);
}

async function token(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

let current: { key: string; user: User } | null = null;

async function toUser(session: any): Promise<User | null> {
  if (!session?.user) return null;
  const key = `${session.user.id}`;
  if (current?.key === key) return current.user;
  const who = await cloudWhoami().catch(() => null);
  const su = session.user;
  const user: User = {
    uid: who?.uid || su.id,
    email: su.email ?? null,
    displayName: su.user_metadata?.name || su.user_metadata?.full_name || null,
    emailVerified: !!su.email_confirmed_at,
    providerData: [{ providerId: su.app_metadata?.provider === "google" ? "google.com" : "password" }],
    getIdToken: token,
    reload: async () => undefined,
  };
  current = { key, user };
  return user;
}

export function onAuthStateChanged(_auth: Auth, cb: (u: User | null) => void): () => void {
  let last: string | null | undefined;
  const emit = async (session: any) => {
    const u = await toUser(session);
    if (!u) current = null;
    theAuth.currentUser = u;
    const id = u?.uid ?? null;
    if (id === last) return;
    last = id;
    cb(u);
    refreshAllListeners();
  };
  void supabase.auth.getSession().then(({ data }) => emit(data.session));
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED" || event === "INITIAL_SESSION") {
      void emit(session);
    }
  });
  return () => data.subscription.unsubscribe();
}

async function signedIn(): Promise<UserCredential> {
  const { data } = await supabase.auth.getSession();
  const user = await toUser(data.session);
  if (!user) throw new AuthError("auth/error", "Please log in again.");
  theAuth.currentUser = user;
  return { user };
}

export async function signInWithEmailAndPassword(_a: Auth, email: string, password: string): Promise<UserCredential> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const err = mapError(error);
    if (err.code === "auth/invalid-credential") {
      // Customers from before the move must set a new password once.
      const r = await prepareLegacyLogin({ data: { email } }).catch(() => ({ legacy: false }));
      if (r.legacy) {
        throw new AuthError(
          "auth/password-reset-needed",
          "We moved to a new login system. Tap \"Forgot password?\" once to set a new password — your wallet and orders are safe.",
        );
      }
    }
    throw err;
  }
  return signedIn();
}

export async function createUserWithEmailAndPassword(_a: Auth, email: string, password: string): Promise<UserCredential> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw mapError(error);
  if (!data.session) {
    throw new AuthError("auth/confirm-email", "Almost done — check your email and tap the confirmation link, then log in.");
  }
  return signedIn();
}

export async function sendPasswordResetEmail(_a: Auth, email: string, _settings?: unknown): Promise<void> {
  await prepareLegacyLogin({ data: { email } }).catch(() => undefined);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw mapError(error);
}

export async function signOut(_a?: Auth): Promise<void> {
  await supabase.auth.signOut();
  current = null;
  theAuth.currentUser = null;
}

export async function updateProfile(_u: User, p: { displayName?: string | null }): Promise<void> {
  if (p.displayName) await supabase.auth.updateUser({ data: { name: p.displayName } }).catch(() => undefined);
}

export class GoogleAuthProvider {
  setCustomParameters(_p: Record<string, string>) {
    return this;
  }
  addScope(_s: string) {
    return this;
  }
}

async function google(): Promise<UserCredential> {
  const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
  if (result.error) throw new AuthError("auth/error", String((result.error as any)?.message || result.error));
  if (result.redirected) return new Promise<UserCredential>(() => undefined);
  return signedIn();
}
export function signInWithPopup(_a: Auth, _p: GoogleAuthProvider): Promise<UserCredential> {
  return google();
}
export async function signInWithRedirect(_a: Auth, _p: GoogleAuthProvider): Promise<void> {
  await google();
}
export async function getRedirectResult(_a: Auth): Promise<UserCredential | null> {
  return null;
}

/* ---- password / email change ---- */

export interface AuthCredential {
  email: string;
  password: string;
}
export const EmailAuthProvider = {
  credential(email: string, password: string): AuthCredential {
    return { email, password };
  },
};
let lastPassword = "";
export async function reauthenticateWithCredential(_u: User, cred: AuthCredential): Promise<UserCredential> {
  const { error } = await supabase.auth.signInWithPassword({ email: cred.email, password: cred.password });
  if (error) throw new AuthError("auth/wrong-password", "Current password is wrong.");
  lastPassword = cred.password;
  return signedIn();
}
export async function updatePassword(_u: User, password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password, ...(lastPassword ? { current_password: lastPassword } : {}) } as any);
  if (error) throw mapError(error);
}
export async function verifyBeforeUpdateEmail(_u: User, email: string, _s?: unknown): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: window.location.origin });
  if (error) throw mapError(error);
}
