import { useStore } from "@/context/StoreContext";
import { splitEmojiText } from "@/lib/web-emoji";
import { EmojiArt } from "./EmojiArt";

/**
 * Renders any text so every emoji inside it follows what the admin picked in
 * the bot (/setemoji). Premium emojis show their real artwork.
 */
export function EmoText({ text, className = "" }: { text: string; className?: string }) {
  const { emojiFor } = useStore();
  const parts = splitEmojiText(String(text ?? ""));
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.text !== undefined) return <span key={i}>{p.text}</span>;
        const picked = emojiFor(p.emoji!);
        if (picked.img) return <EmojiArt key={i} src={picked.img} />;
        return <span key={i}>{picked.char}</span>;
      })}
    </span>
  );
}
