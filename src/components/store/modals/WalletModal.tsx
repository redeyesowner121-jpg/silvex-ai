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
import { createDepositLink } from "@/lib/razorpay.functions";
import { Emo } from "@/components/store/Emo";
import { Sheet, inputCls } from "./ui";


export function WalletModal() {
  const { db, user, wallet, profile, config, closeModal, showSuccess, notify } = useStore();
  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState("");
  const [chain, setChain] = useState<"bep20" | "polygon">("bep20");
  const [checking, setChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [upi, setUpi] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [paying, setPaying] = useState(false);
  const [payLink, setPayLink] = useState("");
  const [history, setHistory] = useState<
    Array<{ id: string; type: string; amount: number; desc: string; date: string }>
  >([]);
  const fee = Number(config.fee ?? 25);
  const depositAddress = config.depositAddress || DEPOSIT_ADDRESS;
  const rate = Number(config.inrPerDollar) > 0 ? Number(config.inrPerDollar) : 100;
  const cardsOn = Boolean(config.razorpayKeyId);
  const payFee =
    Number.isFinite(Number(config.razorpayFeePercent)) && Number(config.razorpayFeePercent) >= 0
      ? Number(config.razorpayFeePercent)
      : 3;
  const payBase = Math.round((Number(payAmount) || 0) * rate * 100) / 100;
  const payFeeInr = Math.round(payBase * payFee) / 100;


  async function startCardPayment() {
    if (!user) return notify("Sign in first");
    const usd = Number(payAmount);
    if (!usd || usd <= 0) return notify("Enter how many dollars you want to add");
    setPaying(true);
    try {
      const res = await createDepositLink({
        data: {
          usd,
          uid: user.uid,
          name: profile?.name ?? "",
          email: user.email ?? "",
          phone: profile?.phone ?? "",
          siteUrl: config.siteUrl ?? "",
        },
      });
      if (!res.ok) return notify(res.error);
      setPayLink(res.url);
      window.open(res.url, "_blank");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Could not start the payment");
    } finally {
      setPaying(false);
    }
  }



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

      const res = await checkDeposit({ data: { hash, chain, address: depositAddress } });
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
    <Sheet onClose={closeModal} title="Wallet">
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
          {cardsOn ? (
            <div className="mb-5 rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-black">Pay by card, UPI or netbanking</p>
              <p className="mb-2 text-[11px] text-muted-foreground">
                ₹{rate} = $1, plus a {payFee}% verification fee. Your balance updates on its own
                once the payment is done.
              </p>
              <input
                className={`${inputCls} mb-2`}
                placeholder="Amount in $"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
              {Number(payAmount) > 0 ? (
                <p className="mb-2 text-[11px] font-bold text-muted-foreground">
                  You pay ₹{(payBase + payFeeInr).toFixed(2)} (₹{payBase.toFixed(2)} + ₹
                  {payFeeInr.toFixed(2)} fee) and get ${Number(payAmount)} in your balance
                </p>
              ) : null}

              <button
                onClick={startCardPayment}
                disabled={paying}
                className="w-full rounded-xl bg-primary py-3 font-bold text-primary-foreground disabled:opacity-60"
              >
                {paying ? "Creating payment link…" : "Get payment link"}
              </button>
              {payLink ? (
                <a
                  href={payLink}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block break-all text-center text-[11px] font-bold text-primary underline"
                >
                  Open payment page
                </a>
              ) : null}
            </div>
          ) : null}

          <p className="mb-2 text-xs font-bold text-muted-foreground">
            Send USDT or USDC to this address, then paste the transaction hash.
          </p>
          <div className="mb-3 rounded-xl border border-dashed border-border bg-muted/50 p-3">
            <p className="break-all font-mono text-[11px] font-bold">{depositAddress}</p>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(depositAddress);
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

