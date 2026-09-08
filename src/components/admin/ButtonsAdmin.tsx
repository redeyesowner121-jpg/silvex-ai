import { useEffect, useState } from "react";
import { onValue, ref, update } from "firebase/database";
import { useStore } from "@/context/StoreContext";
import {
  BUTTON_CATALOG,
  BUTTON_COLORS,
  type ButtonColor,
  type ButtonColorMap,
} from "@/lib/button-colors";

const GROUPS = [...new Set(BUTTON_CATALOG.map((b) => b.group))];

export function ButtonsAdmin() {
  const { db, notify } = useStore();
  const [colors, setColors] = useState<ButtonColorMap>({});

  useEffect(() => {
    if (!db) return;
    return onValue(ref(db, "site_settings/button_colors"), (s) => setColors(s.val() || {}));
  }, [db]);

  const pick = async (key: string, color: ButtonColor) => {
    if (!db) return;
    setColors((c) => ({ ...c, [key]: color }));
    await update(ref(db, "site_settings/button_colors"), { [key]: color });
  };

  const setAll = async (color: ButtonColor) => {
    if (!db) return;
    const all = Object.fromEntries(BUTTON_CATALOG.map((b) => [b.key, color]));
    setColors(all);
    await update(ref(db, "site_settings/button_colors"), all);
    notify(`All buttons set to ${color === "none" ? "no colour" : color}`);
  };

  const reset = async () => {
    if (!db) return;
    const all = Object.fromEntries(BUTTON_CATALOG.map((b) => [b.key, b.fallback]));
    setColors(all);
    await update(ref(db, "site_settings/button_colors"), all);
    notify("Button colours reset");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-3">
        <p className="text-sm font-black">Bot button colours</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose the colour of every button inside the Telegram bot. Changes apply straight away.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {BUTTON_COLORS.map((c) => (
            <button
              key={c.value}
              onClick={() => setAll(c.value)}
              className="rounded-lg bg-muted px-3 py-1.5 text-xs font-bold"
            >
              {c.dot} All {c.label.toLowerCase()}
            </button>
          ))}
          <button onClick={reset} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-bold">
            ↺ Reset
          </button>
        </div>
      </div>

      {GROUPS.map((group) => (
        <div key={group} className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-muted-foreground">
            {group}
          </p>
          <div className="space-y-2">
            {BUTTON_CATALOG.filter((b) => b.group === group).map((b) => {
              const current = colors[b.key] ?? b.fallback;
              return (
                <div
                  key={b.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-2"
                >
                  <p className="text-sm font-bold">{b.label}</p>
                  <div className="flex gap-1.5">
                    {BUTTON_COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => pick(b.key, c.value)}
                        className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                          current === c.value
                            ? "bg-foreground text-background"
                            : "bg-card shadow-sm"
                        }`}
                      >
                        {c.dot}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
