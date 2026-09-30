import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import { savePushSubscription, getVapidKey } from "@/lib/push.functions";
import { toast } from "sonner";

function toBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribe(getToken: () => Promise<string>) {
  const reg = await navigator.serviceWorker.register("/push-sw.js");
  await navigator.serviceWorker.ready;
  const { key } = await getVapidKey();
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) }));
  const json = sub.toJSON() as any;
  return savePushSubscription({
    data: { idToken: await getToken(), sub: { endpoint: json.endpoint, keys: json.keys } },
  });
}

/** Small card asking signed-in users to turn on phone pop-up notifications. */
export function PushPrompt() {
  const { user } = useStore();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    if (Notification.permission === "granted") {
      // Keep this device registered (e.g. after sign-in on a new account).
      void subscribe(() => user.getIdToken()).catch(() => undefined);
      return;
    }
    if (Notification.permission === "denied") return;
    if (localStorage.getItem("pushPromptHidden") === "1") return;
    setShow(true);
  }, [user]);

  if (!show || !user) return null;

  const enable = async () => {
    if (window.top !== window.self) {
      toast.error("Open the site in its own tab (or the installed app) to turn on notifications.");
      return;
    }
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        toast.error("Notifications are blocked. Allow them in your browser's site settings.");
        return;
      }
      const r = await subscribe(() => user.getIdToken());
      if (r.ok) {
        toast.success(r.admin ? "Notifications on — you'll get every store alert." : "Notifications on!");
        setShow(false);
      } else toast.error(r.error);
    } catch {
      toast.error("Couldn't turn on notifications on this device.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-x-3 bottom-24 z-50 mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl">
      <button
        aria-label="Close"
        className="absolute right-3 top-3 text-muted-foreground"
        onClick={() => {
          localStorage.setItem("pushPromptHidden", "1");
          setShow(false);
        }}
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-foreground">Turn on notifications</p>
          <p className="text-sm text-muted-foreground">
            Get order, deposit and sale alerts on your home and lock screen. Tip: add this site to your home screen for the app.
          </p>
          <button
            disabled={busy}
            onClick={enable}
            className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? "Turning on…" : "Allow notifications"}
          </button>
        </div>
      </div>
    </div>
  );
}
