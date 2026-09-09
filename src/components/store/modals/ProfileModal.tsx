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
import { checkDeposit, fallbackDepositAddress } from "@/lib/deposit.functions";
import { Emo } from "@/components/store/Emo";
import { Sheet, inputCls } from "./ui";

export function ProfileModal() {
  const { auth, db, user, profile, wallet, closeModal, openModal, showSuccess, notify, emoji } = useStore();
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
          <span><Emo k="web.orders" /> Orders</span>
          <span>›</span>
        </button>
        <button
          onClick={() => openModal("suggestion")}
          className="flex w-full justify-between rounded-xl border border-border p-3.5 text-sm font-bold"
        >
          <span><Emo k="web.idea" /> Request a product</span>
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

