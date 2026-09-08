import { useStore } from "@/context/StoreContext";

/**
 * Shows the emoji chosen in the bot (/setemoji -> Website emojis). When the
 * admin picked a Telegram premium emoji, its artwork is shown instead of the
 * plain character.
 */
export function Emo({ k, className = "" }: { k: string; className?: string }) {
  const { emoji, emojiImg } = useStore();
  const img = emojiImg(k);
  const char = emoji(k);
  if (img) {
    return (
      <img
        src={img}
        alt=""
        aria-hidden
        loading="lazy"
        decoding="async"
        className={`inline-block h-[1.15em] w-[1.15em] align-[-0.2em] object-contain ${className}`}
      />
    );
  }
  return <span className={className}>{char}</span>;
}
