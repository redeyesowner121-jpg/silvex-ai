import { Link } from "@tanstack/react-router";
import { Bell, ShieldCheck } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import logoUrl from "@/assets/silvex-logo.jpg";

export function Header() {
  const { user, profile, isAdmin, notices, openModal, siteName } = useStore();
  const balance = Number(profile?.wallet ?? 0);

  return (
    <header className="glass sticky top-0 z-50">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2 px-4 py-3 md:max-w-5xl md:px-8">
        <Link to="/" className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative shrink-0">
            <img
              src={logoUrl}
              alt={`${siteName} logo`}
              decoding="async"
              className="shadow-colored-primary h-11 w-11 rounded-2xl object-cover ring-2 ring-primary/20 transition-transform active:scale-95"
            />
            <span className="gradient-primary absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-display block truncate text-base font-extrabold tracking-tight">{siteName}</span>
            {profile ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold">
                <span className="text-muted-foreground">Balance</span>
                <span className="font-display font-extrabold tracking-tight text-primary">${balance.toFixed(2)}</span>
              </span>
            ) : null}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label="Notifications"
            onClick={() => openModal("notifications")}
            className="relative grid h-10 w-10 place-items-center rounded-2xl bg-muted/60 text-muted-foreground transition hover:text-foreground active:scale-95"
          >
            <Bell className="h-5 w-5" />
            {notices.length > 0 ? (
              <span className="gradient-accent absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-accent-foreground">
                {notices.length}
              </span>
            ) : null}
          </button>
          {isAdmin ? (
            <Link
              to="/admin"
              search={{ view: "analysis" }}
              aria-label="Admin panel"
              className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary transition active:scale-95"
            >
              <ShieldCheck className="h-5 w-5" />
            </Link>
          ) : null}
          {user ? (
            <Link to="/profile" aria-label="Profile">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Your profile"
                  decoding="async"
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/40"
                />
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold uppercase text-primary">
                  {(profile?.name || user.email || "U").slice(0, 1)}
                </span>
              )}
            </Link>
          ) : (
            <button onClick={() => openModal("auth")} className="btn-grad rounded-2xl px-4 py-2 text-xs font-bold">
              Login
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
