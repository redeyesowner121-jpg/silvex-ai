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
export function Sheet({
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

export const inputCls =
  "w-full rounded-xl border border-border bg-muted/60 p-3 text-sm outline-none focus:ring-2 focus:ring-ring";
