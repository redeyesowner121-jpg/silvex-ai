/**
 * Renders text as it is. Emojis are only changed where the admin picked one
 * for that exact place (see `Emo`), never by swapping every copy of a symbol.
 */
export function EmoText({ text, className = "" }: { text: string; className?: string }) {
  return <span className={className}>{String(text ?? "")}</span>;
}
