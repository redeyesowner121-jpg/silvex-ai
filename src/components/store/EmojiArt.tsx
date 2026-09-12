import { useEffect, useState } from "react";

/**
 * Shows premium emoji artwork saved from the bot.
 *
 * Two special cases are handled:
 *  - Telegram gives some emojis as a small looping video (.webm) instead of a
 *    picture, so those are played in a muted, looping video tag.
 *  - Some premium emojis are plain white artwork that Telegram re-colours in
 *    the chat. On a light page they would be invisible, so those are painted
 *    with the current text colour instead.
 */

const monoCache = new Map<string, boolean>();
const listeners = new Set<() => void>();

/** True when the picture is only white shapes (so it needs re-colouring). */
function checkWhite(src: string) {
  if (monoCache.has(src) || typeof document === "undefined") return;
  monoCache.set(src, false);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    try {
      const size = 24;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      let visible = 0;
      let white = 0;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3] ?? 0;
        if (a < 40) continue;
        visible++;
        if ((data[i] ?? 0) > 225 && (data[i + 1] ?? 0) > 225 && (data[i + 2] ?? 0) > 225) white++;
      }
      if (visible > 8 && white / visible > 0.92) {
        monoCache.set(src, true);
        listeners.forEach((fn) => fn());
      }
    } catch {
      /* picture could not be read — keep it as it is */
    }
  };
  img.src = src;
}

export function EmojiArt({ src, className = "" }: { src: string; className?: string }) {
  const cls = `inline-block h-[1.15em] w-[1.15em] align-[-0.2em] object-contain ${className}`;
  const isVideo = /^data:video\//i.test(src) || /\.webm(\?|$)/i.test(src);
  const [white, setWhite] = useState(false);

  useEffect(() => {
    if (isVideo || !src) return;
    const sync = () => setWhite(Boolean(monoCache.get(src)));
    listeners.add(sync);
    checkWhite(src);
    sync();
    return () => {
      listeners.delete(sync);
    };
  }, [src, isVideo]);

  if (isVideo) {
    return (
      <video src={src} className={cls} autoPlay loop muted playsInline aria-hidden preload="auto" />
    );
  }

  if (white) {
    return (
      <span
        aria-hidden
        className={cls}
        style={{
          backgroundColor: "currentColor",
          WebkitMaskImage: `url("${src}")`,
          maskImage: `url("${src}")`,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
    );
  }

  return <img src={src} alt="" aria-hidden loading="lazy" decoding="async" className={cls} />;
}
