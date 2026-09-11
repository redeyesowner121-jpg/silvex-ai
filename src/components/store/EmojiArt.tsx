/**
 * Shows premium emoji artwork saved from the bot. Telegram gives some emojis as
 * a small looping video (.webm) instead of a picture, so those are played in a
 * muted, looping video tag — an <img> would show nothing for them.
 */
export function EmojiArt({ src, className = "" }: { src: string; className?: string }) {
  const cls = `inline-block h-[1.15em] w-[1.15em] align-[-0.2em] object-contain ${className}`;
  if (/^data:video\//i.test(src) || /\.webm(\?|$)/i.test(src)) {
    return (
      <video
        src={src}
        className={cls}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden
        preload="auto"
      />
    );
  }
  return <img src={src} alt="" aria-hidden loading="lazy" decoding="async" className={cls} />;
}
