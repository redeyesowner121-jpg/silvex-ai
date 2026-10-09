import type { ReactNode } from "react";
import { useStore } from "@/context/StoreContext";

/**
 * When maintenance mode is on (admin settings), regular visitors see a
 * full-screen maintenance notice. Admins and owners keep full access.
 */
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const { config, isAdmin, siteName } = useStore();
  const on = (config as { maintenanceMode?: boolean }).maintenanceMode === true;

  if (!on || isAdmin) return <>{children}</>;

  const text =
    (config as { maintenanceText?: string }).maintenanceText?.trim() ||
    "We're doing a quick maintenance break. Everything is safe — please check back soon.";
  const support = config.supportTelegram || config.supportLink || "";

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-8 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-3xl">
          🛠
        </div>
        <h1 className="text-lg font-black text-foreground">{siteName} is under maintenance</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
        {support ? (
          <a
            href={support.startsWith("http") ? support : `https://t.me/${support.replace(/^@/, "")}`}
            target="_blank"
            rel="noreferrer"
            className="btn-grad mt-5 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-bold"
          >
            Contact support
          </a>
        ) : null}
      </div>
    </div>
  );
}
