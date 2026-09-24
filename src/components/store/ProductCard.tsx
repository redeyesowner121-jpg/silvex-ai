import { Link } from "@tanstack/react-router";
import { Folder } from "lucide-react";

import { useStore, type Product } from "@/context/StoreContext";
import { productImageSrc } from "@/lib/product-image";
import { Emo } from "@/components/store/Emo";
import { EmoText } from "@/components/store/EmoText";
import { EmojiArt } from "@/components/store/EmojiArt";

export function ProductCard({ product }: { product: Product }) {
  const { openProduct, addToCart, productEmoji } = useStore();
  const pe = productEmoji(product.id);

  return (
    <div className="card-hover shadow-card flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card">
      <button onClick={() => openProduct(product.id)} className="block aspect-video w-full bg-muted">
        {product.logo ? (
          <img
            src={productImageSrc(product.id, product.logo)}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            {pe.img ? (
              <EmojiArt src={pe.img} className="!h-8 !w-8" />
            ) : pe.char ? (
              <span>{pe.char}</span>
            ) : (
              <Emo k="web.bag" />
            )}
          </div>
        )}
      </button>
      <div className="flex flex-1 flex-col p-3">
        {product.type ? (
          <span className="mb-1 w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
            {product.type}
          </span>
        ) : null}
        <h3 className="line-clamp-2 text-sm font-bold leading-tight">
          <button onClick={() => openProduct(product.id)} className="text-left">
            {pe.img ? (
            <img
              src={pe.img}
              alt=""
              aria-hidden
              loading="lazy"
              className="mr-1 inline-block h-[1.15em] w-[1.15em] align-[-0.2em] object-contain"
            />
          ) : pe.char ? (
            <span className="mr-1">{pe.char}</span>
          ) : null}
          <EmoText text={product.title || ""} />
        </h3>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="font-display text-gradient text-lg font-black">${product.price}</span>
          {product.soldOut ? (
            <span className="rounded-xl bg-muted px-3 py-1.5 text-[10px] font-bold uppercase text-muted-foreground">
              Out of stock
            </span>
          ) : (
            <button
              onClick={() => addToCart(product)}
              className="btn-grad rounded-xl px-4 py-1.5 text-xs font-bold"
            >
              ADD
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** One card standing for a folder of product variations (e.g. all LinkedIn plans). */
export function FolderCard({ name, slug, items }: { name: string; slug: string; items: Product[] }) {
  const coverItem = items.find((p) => p.logo);
  const cover = coverItem ? productImageSrc(coverItem.id, coverItem.logo) : undefined;
  const from = Math.min(...items.map((p) => Number(p.price) || 0));

  return (
    <div className="card-hover shadow-card flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-card">
      <Link to="/products" search={{ group: slug }} className="block aspect-video w-full bg-muted">
        {cover ? (
          <img src={cover} alt={name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Folder className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-3">
        <span className="mb-1 flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
          <Folder className="h-3 w-3" aria-hidden="true" /> {items.length} plans
        </span>
        <h3 className="line-clamp-2 text-sm font-bold leading-tight">{name}</h3>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="font-display text-gradient text-lg font-black">from ${from}</span>
          <Link
            to="/products"
            search={{ group: slug }}
            className="btn-grad rounded-xl px-4 py-1.5 text-xs font-bold"
          >
            VIEW
          </Link>
        </div>
      </div>
    </div>
  );
}
