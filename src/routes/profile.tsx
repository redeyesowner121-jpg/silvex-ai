import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ref, update } from "firebase/database";
import { signOut } from "firebase/auth";
import { useStore } from "@/context/StoreContext";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — SILENT SELLER" },
      { name: "description", content: "Manage your wallet, phone number, referral code and orders." },
      { property: "og:title", content: "My Profile — SILENT SELLER" },
      { property: "og:description", content: "Manage your wallet, phone number, referral code and orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProfilePage,
});

const inputCls =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-sm outline-none focus:border-primary";

function ProfilePage() {
  const { auth, db, user, profile, wallet, isAdmin, openModal, showSuccess, notify } = useStore();
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const navigate = useNavigate();

  useEffect(() => setPhone(profile?.phone ?? ""), [profile?.phone]);

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-xl font-bold">My profile</h1>
        <p className="mb-6 text-sm text-muted-foreground">Log in to see your profile.</p>
        <button
          onClick={() => openModal("auth")}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground"
        >
          Login
        </button>
      </div>
    );
  }

  async function savePhone() {
    if (!db || !user) return;
    if (phone.length < 10) return notify("Enter a valid phone number");
    await update(ref(db, `users/${user.uid}`), { phone });
    showSuccess("Updated", "Phone number saved.");
  }

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-4 text-xl font-bold">My profile</h1>
      <div className="mb-6 flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-xl font-bold uppercase text-primary">
          {(profile?.name || user.email || "U").slice(0, 1)}
        </div>
        <div>
          <h2 className="text-lg font-bold">{profile?.name || user.displayName || "User"}</h2>
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
          onClick={() => navigate({ to: "/orders" })}
          className="flex w-full justify-between rounded-xl border border-border p-3.5 text-sm font-bold"
        >
          <span>📦 My orders</span>
          <span>›</span>
        </button>
        <button
          onClick={() => openModal("wallet")}
          className="flex w-full justify-between rounded-xl border border-border p-3.5 text-sm font-bold"
        >
          <span>💳 Wallet & deposits</span>
          <span>›</span>
        </button>
        <button
          onClick={() => openModal("suggestion")}
          className="flex w-full justify-between rounded-xl border border-border p-3.5 text-sm font-bold"
        >
          <span>💡 Request a product</span>
          <span>›</span>
        </button>
        {isAdmin ? (
          <Link
            to="/admin"
            className="flex w-full justify-between rounded-xl border border-border p-3.5 text-sm font-bold"
          >
            <span>🛠️ Admin panel</span>
            <span>›</span>
          </Link>
        ) : null}
      </div>

      <button
        onClick={async () => {
          if (auth) await signOut(auth);
          notify("Logged out");
          navigate({ to: "/" });
        }}
        className="mt-6 w-full rounded-xl bg-destructive/10 py-3.5 text-sm font-bold text-destructive"
      >
        Log out
      </button>
    </div>
  );
}
