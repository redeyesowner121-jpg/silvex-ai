/**
 * App install (PWA) support for the "Download app" button on the profile page.
 * Browsers only fire `beforeinstallprompt` once, early in the page life, so the
 * event is captured here at import time and kept until the user taps Download.
 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferred: InstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
  });
  // The app was installed — drop any stored prompt.
  window.addEventListener("appinstalled", () => {
    deferred = null;
  });
}

export function isAppInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export type InstallResult = "installed" | "prompted" | "manual";

/** Handles a tap on "Download app". Returns what happened so the caller can notify. */
export async function startAppInstall(): Promise<InstallResult> {
  if (isAppInstalled()) return "installed";
  if (deferred) {
    const ev = deferred;
    deferred = null;
    try {
      await ev.prompt();
      return "prompted";
    } catch {
      return "manual";
    }
  }
  return "manual";
}
