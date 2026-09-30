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
import { markNoticesRead, useReadNotices } from "@/lib/notice-read";

export function NotificationsModal() {
  const { notices, closeModal } = useStore();
  const read = useReadNotices();
  const unread = notices.filter((n) => !read.has(n.id)).length;
  return (
    <Sheet onClose={closeModal} title="Notifications">
      <div className="space-y-3 text-sm">
        {notices.length > 0 ? (
          <button
            disabled={unread === 0}
            onClick={() => markNoticesRead(notices.map((n) => n.id))}
            className="btn-grad w-full rounded-xl py-2.5 text-xs font-bold disabled:opacity-50"
          >
            {unread > 0 ? `Mark all as read (${unread})` : "All read"}
          </button>
        ) : null}
        {notices.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">Nothing new right now.</p>
        ) : (
          notices.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl border p-3 ${read.has(n.id) ? "border-border opacity-60" : "border-primary/40 bg-primary/5"}`}
            >
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

