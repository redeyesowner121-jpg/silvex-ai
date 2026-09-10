import { useStore, type Product } from "@/context/StoreContext";
import { Emo } from "@/components/store/Emo";
import { EmoText } from "@/components/store/EmoText";

export function ProductCard({ product }: { product: Product }) {
  const { openProduct, addToCart, productEmoji } = useStore();
  const pe = productEmoji(product.id);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <button onClick={() => openProduct(product.id)} className="block aspect-[16/6] w-full bg-muted">
        {product.logo ? (
          <img
            src={product.logo}
            alt={product.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            {pe.img ? (
              <img src={pe.img} alt="" aria-hidden loading="lazy" className="h-8 w-8 object-contain" />
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
          <span className="mb-1 w-fit rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
            {product.type}
          </span>
        ) : null}
        <h3 className="line-clamp-2 text-sm font-bold leading-tight">
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
          <span className="text-lg font-black">${product.price}</span>
          <button
            onClick={() => addToCart(product)}
            className="btn-grad rounded-lg px-3 py-1.5 text-xs font-bold"
          >
            ADD
          </button>
        </div>
      </div>
    </div>
  );
}
