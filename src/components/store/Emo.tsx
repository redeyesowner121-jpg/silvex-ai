import { useStore } from "@/context/StoreContext";
import { EmojiArt } from "./EmojiArt";

/**
 * Shows the emoji chosen in the bot (/setemoji -> Website emojis). When the
 * admin picked a Telegram premium emoji, its artwork is shown instead of the
 * plain character.
 */
export function Emo({ k, className = "" }: { k: string; className?: string }) {
  const { emoji, emojiImg } = useStore();
  const img = emojiImg(k);
  const char = emoji(k);
  if (img) return <EmojiArt src={img} className={className} />;
  return <span className={className}>{char}</span>;
}
