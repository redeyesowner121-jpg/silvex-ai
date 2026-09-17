import { useEffect, useState, type ReactNode } from "react";
import { EmojiArt } from "@/components/store/EmojiArt";
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
import { EmoText } from "@/components/store/EmoText";
import { Sheet, inputCls } from "./ui";

export function ProductModal() {
  const { db, user, products, activeProductId, closeModal, addToCart, notify, profile, productEmoji } =
    useStore();
  const pe = productEmoji(activeProductId || "");
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

  const anyP = product as unknown as {
    stock?: unknown[];
    supplierStock?: number;
    delivery?: string;
    salesCount?: number;
  };
  const stockCount =
    anyP.delivery === "supplier"
      ? Number(anyP.supplierStock || 0)
      : Array.isArray(anyP.stock)
        ? anyP.stock.filter(Boolean).length
        : 0;
  const unlimited = anyP.delivery === "repeat";
  const sold = Number(anyP.salesCount || 0);

  return (
    <Sheet onClose={closeModal}>
      {product.logo ? (
        <img
          src={product.logo}
          alt={product.title}
          className="mx-auto mb-4 aspect-video w-full rounded-xl object-cover"
        />
      ) : null}
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          {product.type ? (
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
              {product.type}
            </span>
          ) : null}
          <h3 className="mt-1 text-xl font-bold leading-tight">
            {pe.img ? (
              <EmojiArt src={pe.img} className="mr-1" />
            ) : pe.char ? (
              <span className="mr-1">{pe.char}</span>
            ) : null}
            <EmoText text={product.title || ""} />
          </h3>
        </div>
        <div className="text-xl font-black text-primary">${product.price}</div>
      </div>

      <div className="mb-3 flex gap-2 text-xs font-semibold">
        <span className="rounded-lg bg-muted/60 px-2 py-1">
          <Emo k="web.stock" /> Stock: {unlimited ? "Unlimited" : stockCount}
        </span>
        <span className="rounded-lg bg-muted/60 px-2 py-1">
          <Emo k="web.sold" /> Total sold: {sold}
        </span>
      </div>

      {product.desc ? (
        <blockquote className="mb-4 whitespace-pre-line break-words border-l-4 border-primary/60 bg-muted/50 py-2 pl-3 pr-2 text-sm italic leading-relaxed text-muted-foreground">
          <EmoText text={product.desc} />
        </blockquote>
      ) : null}


      <div className="border-t border-border pt-3">
        <h4 className="mb-2 text-sm font-bold">
          <Emo k="web.star" /> Reviews
        </h4>
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

