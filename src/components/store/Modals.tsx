import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
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

function Sheet({
  onClose,
  children,
  title,
}: {
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="fade-in max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-card p-6 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between">
          {title ? <h2 className="text-xl font-black">{title}</h2> : <span />}
          <button onClick={onClose} aria-label="Close" className="text-muted-foreground">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-border bg-muted/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring";

export function SuccessOverlay() {
  const { success, closeSuccess } = useStore();
  if (!success) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background p-6 text-center">
      <div className="success-checkmark mb-6">
        <div className="check-icon" />
      </div>
      <h2 className="mb-2 text-2xl font-black">{success.title}</h2>
      <p className="mb-8 text-sm text-muted-foreground">{success.desc}</p>
      <button
        onClick={closeSuccess}
        className="w-full max-w-xs rounded-xl bg-foreground py-3.5 text-sm font-bold text-background"
      >
        Continue
      </button>
    </div>
  );
}

export function AuthModal() {
  const { auth, db, closeModal, showSuccess, notify } = useStore();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [refCode, setRefCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!auth || !db) return;
    setBusy(true);
    try {
      if (mode === "signup") {
        const res = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(res.user, { displayName: name });
        const myRefCode = (name.slice(0, 3) + Math.floor(100 + Math.random() * 900)).toUpperCase();
        let wallet = 0;
        if (refCode.trim()) {
          const snap = await get(
            query(ref(db, "users"), orderByChild("myRefCode"), equalTo(refCode.trim().toUpperCase())),
          );
          if (snap.exists()) {
            const key = Object.keys(snap.val())[0]!;
            const referrer = snap.val()[key];
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
        await set(ref(db, `users/${res.user.uid}`), { name, email, wallet, myRefCode });
        showSuccess("Account created", "Welcome to RKR Premium Store!");
      } else {
        await signInWithEmailAndPassword(auth, email, pass);
        showSuccess("Logged in", "Welcome back.");
      }
      closeModal();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!auth || !db) return;
    try {
      const res = await signInWithPopup(auth, new GoogleAuthProvider());
      const u = res.user;
      const snap = await get(ref(db, `users/${u.uid}`));
      if (!snap.exists()) {
        const myRefCode = (
          (u.displayName || "USR").slice(0, 3) + Math.floor(100 + Math.random() * 900)
        ).toUpperCase();
        await set(ref(db, `users/${u.uid}`), {
          name: u.displayName,
          email: u.email,
          wallet: 0,
          myRefCode,
        });
      }
      closeModal();
      showSuccess("Welcome!", "Login successful.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Google sign-in failed");
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

export function ProfileModal() {
  const { auth, db, user, profile, wallet, closeModal, openModal, showSuccess, notify } = useStore();
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const navigate = useNavigate();

  useEffect(() => setPhone(profile?.phone ?? ""), [profile?.phone]);
  if (!user) return null;

  async function savePhone() {
    if (!db || !user) return;
    if (phone.length < 10) return notify("Enter a valid phone number");
    await update(ref(db, `users/${user.uid}`), { phone });
    showSuccess("Updated", "Phone number saved.");
  }

  return (
    <Sheet onClose={closeModal} title="My profile">
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-xl font-bold uppercase text-primary">
          {(profile?.name || user.email || "U").slice(0, 1)}
        </div>
        <div>
          <h3 className="text-lg font-bold">{profile?.name || user.displayName || "User"}</h3>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>
      <div className="mb-6 flex items-center justify-between rounded-2xl bg-foreground p-5 text-background shadow-lg">
        <div>
          <p className="text-[10px] font-bold uppercase opacity-70">Wallet balance</p>
          <p className="text-2xl font-bold">${wallet}</p>
        </div>
        <button
          onClick={() => openModal("wallet")}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-lg font-bold text-foreground"
        >
          ＋
        </button>
      </div>
      {profile?.myRefCode ? (
        <div className="mb-4 rounded-xl border border-dashed border-border p-3 text-center text-xs font-bold">
          Referral code: <span className="text-primary">{profile.myRefCode}</span> — friends get you
          $20
        </div>
      ) : null}
      <label className="mb-1 ml-1 block text-xs font-bold text-muted-foreground">Phone number</label>
      <div className="mb-4 flex gap-2">
        <input
          className={inputCls}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Add mobile"
        />
        <button
          onClick={savePhone}
          className="rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground"
        >
          Save
        </button>
      </div>
      <div className="space-y-2">
        <button
          onClick={() => {
            closeModal();
            navigate({ to: "/orders" });
          }}
          className="flex w-full justify-between rounded-xl border border-border p-3.5 text-sm font-bold"
        >
          <span>📦 My orders</span>
          <span>›</span>
        </button>
        <button
          onClick={() => openModal("suggestion")}
          className="flex w-full justify-between rounded-xl border border-border p-3.5 text-sm font-bold"
        >
          <span>💡 Request a product</span>
          <span>›</span>
        </button>
      </div>
      <button
        onClick={async () => {
          if (auth) await signOut(auth);
          closeModal();
          notify("Logged out");
        }}
        className="mt-6 w-full rounded-xl bg-destructive/10 py-3.5 text-sm font-bold text-destructive"
      >
        Log out
      </button>
    </Sheet>
  );
}

export function WalletModal() {
  const { db, user, wallet, profile, config, closeModal, showSuccess, notify } = useStore();
  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [chain, setChain] = useState<"bep20" | "polygon">("bep20");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [upi, setUpi] = useState("");
  const [history, setHistory] = useState<
    Array<{ id: string; type: string; amount: number; desc: string; date: string }>
  >([]);
  const fee = Number(config.fee ?? 25);

  useEffect(() => {
    if (!db || !user) return;
    return onValue(ref(db, `users/${user.uid}/history`), (s) => {
      const val = s.val() || {};
      setHistory(
        Object.entries(val)
          .map(([id, h]) => ({ id, ...(h as Omit<(typeof history)[number], "id">) }))
          .reverse(),
      );
    });
  }, [db, user]);

  async function submitDeposit() {
    if (!db || !user) return;
    const hash = txHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) return notify("Paste the full transaction hash");
    setChecking(true);
    try {
      const claimed = await get(ref(db, `deposits/${hash}`));
      if (claimed.exists()) return notify("This transaction has already been used.");

      const res = await checkDeposit({ data: { hash, chain } });
      if (!res.ok) return notify(res.message);

      const base = {
        uid: user.uid,
        name: profile?.name ?? user.email,
        email: user.email,
        amount: res.amount,
        symbol: res.symbol,
        chain: res.chain,
        txHash: hash,
        date: new Date().toISOString(),
      };

      if (res.status === "credited") {
        await set(ref(db, `deposits/${hash}`), { ...base, status: "Credited" });
        const w = await get(ref(db, `users/${user.uid}/wallet`));
        await set(ref(db, `users/${user.uid}/wallet`), (Number(w.val()) || 0) + res.amount);
        await push(ref(db, `users/${user.uid}/history`), {
          type: "Deposit",
          amount: res.amount,
          desc: `${res.symbol} on ${res.chain}`,
          date: base.date,
        });
        closeModal();
        showSuccess("Balance added", `$${res.amount} credited to your wallet.`);
      } else {
        await set(ref(db, `deposits/${hash}`), { ...base, status: "Pending" });
        await push(ref(db, "requests"), { ...base, type: "Deposit", utr: hash, status: "Pending" });
        closeModal();
        showSuccess("Sent for review", res.message);
      }
      setTxHash("");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not check that transaction");
    } finally {
      setChecking(false);
    }
  }

  async function submitWithdraw() {
    if (!db || !user) return;
    const amt = Number(amount);
    if (!amt || !upi) return notify("Enter amount and UPI ID");
    if (amt > wallet) return notify("Not enough balance");
    await push(ref(db, "requests"), {
      uid: user.uid,
      name: profile?.name ?? user.email,
      email: user.email,
      type: "Withdraw",
      amount: amt,
      payable: Math.round(amt - (amt * fee) / 100),
      upi,
      phone: profile?.phone ?? "",
      status: "Pending",
      date: new Date().toISOString(),
    });
    setAmount("");
    setUpi("");
    closeModal();
    showSuccess("Request sent", "Withdrawal is processed after admin approval.");
  }

  return (
    <Sheet onClose={closeModal} title="My wallet">
      <div className="mb-6 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 p-6 text-center text-white shadow-lg">
        <p className="text-xs font-bold uppercase tracking-widest opacity-80">Available balance</p>
        <div className="mt-1 text-4xl font-black">${wallet}</div>
      </div>
      <div className="mb-4 flex rounded-xl bg-muted p-1">
        {(["deposit", "withdraw", "history"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold capitalize ${
              tab === t ? "bg-card shadow-sm" : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "deposit" ? (
        <div>
          <p className="mb-2 text-xs font-bold text-muted-foreground">
            Send USDT or USDC to this address, then paste the transaction hash.
          </p>
          <div className="mb-3 rounded-xl border border-dashed border-border bg-muted/50 p-3">
            <p className="break-all font-mono text-[11px] font-bold">{DEPOSIT_ADDRESS}</p>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(DEPOSIT_ADDRESS);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="mt-2 rounded-lg bg-foreground px-3 py-1 text-[11px] font-bold text-background"
            >
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
          <div className="mb-2 flex gap-2">
            {(
              [
                ["bep20", "BEP20 (BNB)"],
                ["polygon", "Polygon"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setChain(key)}
                className={`flex-1 rounded-xl border p-2 text-xs font-bold ${
                  chain === key ? "border-primary bg-primary/10 text-primary" : "border-border"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            className={`${inputCls} mb-3 font-mono text-xs`}
            placeholder="Transaction hash (0x...)"
            value={txHash}
            onChange={(e) => setTxHash(e.target.value)}
          />
          <button
            onClick={submitDeposit}
            disabled={checking}
            className="w-full rounded-xl bg-emerald-500 py-3 font-bold text-white disabled:opacity-60"
          >
            {checking ? "Checking on-chain…" : "Verify & add balance"}
          </button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Verified payments are credited instantly in $. Anything older than 10 minutes is
            reviewed by an admin.
          </p>
        </div>
      ) : null}

      {tab === "withdraw" ? (
        <div>
          <p className="mb-2 rounded bg-destructive/10 p-2 text-xs font-bold text-destructive">
            Fee: {fee}% will be deducted.
          </p>
          <input
            className={`${inputCls} mb-2`}
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <input
            className={`${inputCls} mb-3`}
            placeholder="UPI ID"
            value={upi}
            onChange={(e) => setUpi(e.target.value)}
          />
          <button
            onClick={submitWithdraw}
            className="w-full rounded-xl bg-destructive py-3 font-bold text-destructive-foreground"
          >
            Request withdrawal
          </button>
        </div>
      ) : null}

      {tab === "history" ? (
        <div className="space-y-2 text-sm">
          {history.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No transactions yet.</p>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between rounded-xl border border-border p-3"
              >
                <div>
                  <p className="text-xs font-bold">{h.type}</p>
                  <p className="text-[11px] text-muted-foreground">{h.desc}</p>
                </div>
                <span className="text-sm font-black">${h.amount}</span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </Sheet>
  );
}

export function ProductModal() {
  const { db, user, products, activeProductId, closeModal, addToCart, notify, profile } = useStore();
  const [reviews, setReviews] = useState<
    Array<{ id: string; name: string; rating: number; comment: string }>
  >([]);
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const product = products.find((p) => p.id === activeProductId);

  useEffect(() => {
    if (!db || !activeProductId) return;
    return onValue(ref(db, `products/${activeProductId}/reviews`), (s) => {
      const val = s.val() || {};
      setReviews(
        Object.entries(val).map(([id, r]) => ({
          id,
          ...(r as { name: string; rating: number; comment: string }),
        })),
      );
    });
  }, [db, activeProductId]);

  if (!product) return null;

  async function submitReview() {
    if (!user) return notify("Please log in first");
    if (!db || !comment) return;
    await push(ref(db, `products/${product!.id}/reviews`), {
      name: profile?.name ?? user.email,
      uid: user.uid,
      rating: Number(rating),
      comment,
      date: new Date().toISOString(),
    });
    setComment("");
    notify("Review added!");
  }

  return (
    <Sheet onClose={closeModal}>
      {product.logo ? (
        <img
          src={product.logo}
          alt={product.title}
          className="mb-4 h-44 w-full rounded-xl object-cover"
        />
      ) : null}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          {product.type ? (
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
              {product.type}
            </span>
          ) : null}
          <h3 className="mt-1 text-xl font-bold leading-tight">{product.title}</h3>
        </div>
        <div className="text-xl font-black text-primary">${product.price}</div>
      </div>
      {product.desc ? (
        <p className="mb-4 rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground">{product.desc}</p>
      ) : null}

      <div className="border-t border-border pt-3">
        <h4 className="mb-2 text-sm font-bold">⭐ Reviews</h4>
        <div className="mb-3 max-h-32 space-y-2 overflow-y-auto text-xs">
          {reviews.length === 0 ? (
            <p className="text-muted-foreground">No reviews yet.</p>
          ) : (
            reviews.map((r) => (
              <div key={r.id} className="rounded bg-muted/60 p-2">
                <div className="flex justify-between font-bold">
                  <span>{r.name}</span>
                  <span className="text-amber-500">{"★".repeat(Number(r.rating) || 5)}</span>
                </div>
                <div className="text-muted-foreground">{r.comment}</div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="rounded border border-border bg-muted/60 p-2 text-xs"
          >
            <option value="5">5★</option>
            <option value="4">4★</option>
            <option value="3">3★</option>
          </select>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Write a review..."
            className="flex-1 rounded border border-border bg-muted/60 p-2 text-xs"
          />
          <button
            onClick={submitReview}
            className="rounded bg-primary px-3 text-xs font-bold text-primary-foreground"
          >
            Post
          </button>
        </div>
      </div>

      <button
        onClick={() => {
          addToCart(product!);
          closeModal();
        }}
        className="btn-grad mt-5 w-full rounded-xl py-3 text-sm font-bold"
      >
        Add to cart · ${product.price}
      </button>
    </Sheet>
  );
}

export function NotificationsModal() {
  const { notices, closeModal } = useStore();
  return (
    <Sheet onClose={closeModal} title="Notifications">
      <div className="space-y-3 text-sm">
        {notices.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Nothing new right now.</p>
        ) : (
          notices.map((n) => (
            <div key={n.id} className="rounded-xl border border-border p-3">
              <p className="font-medium">{n.msg}</p>
              {n.date ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(n.date).toLocaleString()}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </Sheet>
  );
}

export function SuggestionModal() {
  const { db, user, profile, closeModal, showSuccess, notify } = useStore();
  const [text, setText] = useState("");
  return (
    <Sheet onClose={closeModal} title="Request a product">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={`${inputCls} mb-3 h-24`}
        placeholder="Tell us what you need..."
      />
      <button
        onClick={async () => {
          if (!db || !text) return notify("Write something first");
          await push(ref(db, "admin/suggestions"), {
            text,
            user: profile?.name ?? user?.email ?? "Guest",
            date: new Date().toISOString(),
          });
          closeModal();
          showSuccess("Sent", "We'll look into your request.");
        }}
        className="btn-grad w-full rounded-xl py-3 text-sm font-bold"
      >
        Send request
      </button>
    </Sheet>
  );
}

export function Modals() {
  const { modal } = useStore();
  return (
    <>
      {modal === "auth" ? <AuthModal /> : null}
      {modal === "profile" ? <ProfileModal /> : null}
      {modal === "wallet" ? <WalletModal /> : null}
      {modal === "product" ? <ProductModal /> : null}
      {modal === "notifications" ? <NotificationsModal /> : null}
      {modal === "suggestion" ? <SuggestionModal /> : null}
      <SuccessOverlay />
    </>
  );
}
