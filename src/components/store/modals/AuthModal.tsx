import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  equalTo,
  get,
  onValue,
  orderByChild,
  push,
  query,
  ref,
  set,
  update,
} from "firebase/database";
import { useStore } from "@/context/StoreContext";
import { checkDeposit, DEPOSIT_ADDRESS } from "@/lib/deposit.functions";
import { Emo } from "@/components/store/Emo";
import { Sheet, inputCls } from "./ui";

export function AuthModal() {
  const { auth, db, closeModal, showSuccess, notify } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [refCode, setRefCode] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("ref")?.toUpperCase() ?? "";
  });
  const [busy, setBusy] = useState(false);

  function friendly(e: unknown) {
    const code = (e as { code?: string })?.code || "";
    const map: Record<string, string> = {
      "auth/invalid-email": "That email address doesn't look right.",
      "auth/missing-password": "Please enter your password.",
      "auth/weak-password": "Password must be at least 6 characters.",
      "auth/email-already-in-use": "This email already has an account. Try logging in instead.",
      "auth/invalid-credential": "Wrong email or password.",
      "auth/invalid-login-credentials": "Wrong email or password.",
      "auth/wrong-password": "Wrong email or password.",
      "auth/user-not-found": "No account with this email. Create one first.",
      "auth/too-many-requests": "Too many attempts. Please wait a minute and try again.",
      "auth/network-request-failed": "Network problem. Check your connection and try again.",
      "auth/popup-blocked": "Your browser blocked the Google window. Redirecting instead…",
      "auth/operation-not-allowed": "Google sign-in is not switched on yet for this store.",
      "auth/unauthorized-domain": "This website address is not allowed for Google sign-in yet.",
    };
    return map[code] || (e instanceof Error ? e.message : "Something went wrong");
  }

  async function submit() {
    if (!auth || !db) return;
    const mail = email.trim().toLowerCase();
    if (!mail || !pass) {
      notify("Please enter your email and password.");
      return;
    }
    if (mode === "signup" && pass.length < 6) {
      notify("Password must be at least 6 characters.");
      return;
    }
    if (mode === "signup" && !name.trim()) {
      notify("Please enter your name.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const res = await createUserWithEmailAndPassword(auth, mail, pass);
        await updateProfile(res.user, { displayName: name });
        const myRefCode = (name.slice(0, 3) + Math.floor(100 + Math.random() * 900)).toUpperCase();
        let wallet = 0;
        let refBy = "";
        let usedRef = "";
        if (refCode.trim()) {
          const snap = await get(
            query(ref(db, "users"), orderByChild("myRefCode"), equalTo(refCode.trim().toUpperCase())),
          );
          if (snap.exists()) {
            const key = Object.keys(snap.val())[0]!;
            const referrer = snap.val()[key];
            refBy = key;
            usedRef = refCode.trim().toUpperCase();
            await set(ref(db, `users/${key}/wallet`), (Number(referrer.wallet) || 0) + 20);
            await push(ref(db, `users/${key}/history`), {
              type: "Referral",
              amount: 20,
              desc: `User ${name} joined`,
              date: new Date().toISOString(),
            });
            wallet = 20;
          }
        }
        await update(ref(db, `users/${res.user.uid}`), {
          name,
          email: mail,
          wallet,
          myRefCode,
          ...(refBy ? { refBy, usedRef } : {}),
        });
        showSuccess("Account created", "Welcome to SILENT SELLER!");
      } else {
        await signInWithEmailAndPassword(auth, mail, pass);
        showSuccess("Logged in", "Welcome back.");
      }
      closeModal();
    } catch (e) {
      notify(friendly(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveGoogleUser(u: { uid: string; displayName: string | null; email: string | null }) {
    if (!db) return;
    const snap = await get(ref(db, `users/${u.uid}`));
    if (!snap.exists()) {
      const myRefCode = (
        (u.displayName || "USR").replace(/[^a-zA-Z]/g, "").slice(0, 3) ||
        "USR" + Math.floor(100 + Math.random() * 900)
      ).toUpperCase() + Math.floor(100 + Math.random() * 900);
      await update(ref(db, `users/${u.uid}`), {
        name: u.displayName || u.email?.split("@")[0] || "User",
        email: u.email || "",
        wallet: 0,
        myRefCode,
      });
    }
  }

  // Finish a Google sign-in that came back through a full-page redirect
  // (used when the browser blocks popups, e.g. inside in-app browsers).
  useEffect(() => {
    if (!auth || !db) return;
    getRedirectResult(auth)
      .then(async (res) => {
        if (!res?.user) return;
        await saveGoogleUser(res.user);
        closeModal();
        showSuccess("Welcome!", "Login successful.");
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, db]);

  async function google() {
    if (!auth || !db) return;
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const res = await signInWithPopup(auth, provider);
      await saveGoogleUser(res.user);
      closeModal();
      showSuccess("Welcome!", "Login successful.");
    } catch (e) {
      const code = (e as { code?: string })?.code || "";
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          await signInWithRedirect(auth, new GoogleAuthProvider());
          return;
        } catch (err) {
          notify(friendly(err));
        }
      } else {
        notify(friendly(e));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={closeModal} title={mode === "login" ? "Welcome back" : "Create account"}>
      <button
        onClick={google}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border p-3 text-sm font-bold"
      >
        <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="" className="h-5 w-5" />
        Continue with Google
      </button>
      <div className="mb-4 text-center text-xs text-muted-foreground">OR USE EMAIL</div>
      {mode === "signup" ? (
        <input
          className={`${inputCls} mb-3`}
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      ) : null}
      <input
        className={`${inputCls} mb-3`}
        placeholder="Email address"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className={`${inputCls} mb-3`}
        type="password"
        placeholder="Password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
      />
      {mode === "signup" ? (
        <input
          className={`${inputCls} mb-3`}
          placeholder="Referral code (optional)"
          value={refCode}
          onChange={(e) => setRefCode(e.target.value)}
        />
      ) : null}
      <button
        onClick={submit}
        disabled={busy}
        className="btn-grad w-full rounded-xl py-3 text-sm font-bold disabled:opacity-60"
      >
        {mode === "login" ? "Login" : "Sign up"}
      </button>
      <p
        onClick={() => setMode(mode === "login" ? "signup" : "login")}
        className="mt-5 cursor-pointer text-center text-xs font-bold text-muted-foreground"
      >
        {mode === "login" ? "New here? Create account" : "Already have an account? Login"}
      </p>
    </Sheet>
  );
}

