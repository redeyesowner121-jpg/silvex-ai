import { Link } from "@tanstack/react-router";
import { useStore } from "@/context/StoreContext";
import { Emo } from "@/components/store/Emo";
import logoAsset from "@/assets/silvex-logo.jpg.asset.json";

export function Header() {
  const { user, profile, isAdmin, notices, openModal, siteName, emoji } = useStore();
  const [first, ...rest] = siteName.split(" ");

  return (
    <header className="glass sticky top-0 z-40">
      <div className="mx-auto flex h-16 w-full max-w-md items-center justify-between px-4 md:max-w-5xl md:px-8">
        <Link to="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
          <img
            src={logoAsset.url}
            alt="Silvex Ai logo"
            decoding="async"
            className="h-10 w-10 rounded-xl border border-primary/40 object-cover shadow-sm"
          />
          <span>
            {first} <span className="text-primary">{rest.join(" ")}</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <button
            aria-label="Notifications"
            onClick={() => openModal("notifications")}
            className="relative text-xl"
          >
            <Emo k="web.bell" />
            {notices.length > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                {notices.length}
              </span>
            ) : null}
          </button>
          {isAdmin ? (
            <Link to="/admin" search={{}} aria-label="Admin panel" className="text-xl">
              <Emo k="web.admin" />
            </Link>
          ) : null}
          {user ? (
            <Link to="/profile" aria-label="Profile">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Your profile"
                  decoding="async"
                  className="h-9 w-9 rounded-full border-2 border-primary object-cover"
                />
              ) : (
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold uppercase text-primary">
                  {(profile?.name || user.email || "U").slice(0, 1)}
                </span>
              )}
            </Link>

          ) : (
            <button
              onClick={() => openModal("auth")}
              className="btn-grad rounded-lg px-4 py-2 text-xs font-bold"
            >
              Login
            </button>
          )}

        </div>
      </div>
    </header>
  );
}
