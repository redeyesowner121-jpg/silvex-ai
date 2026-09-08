/**
 * Colours for every button in the Telegram bot. Admins pick them on the
 * website (Admin → Management → Bot buttons); the value is stored in Firebase
 * under site_settings/button_colors and read by the bot on every update.
 */
export type ButtonColor = "green" | "blue" | "red" | "none";

export const BUTTON_COLORS: { value: ButtonColor; label: string; dot: string }[] = [
  { value: "green", label: "Green", dot: "🟢" },
  { value: "blue", label: "Blue", dot: "🔵" },
  { value: "red", label: "Red", dot: "🔴" },
  { value: "none", label: "No colour", dot: "⚪" },
];

export type ButtonDef = {
  /** callback_data pattern, * matches one dynamic part. "url" = link buttons. */
  key: string;
  label: string;
  group: "Main menu" | "Shopping" | "Wallet & profile" | "Admin panel" | "Admin actions";
  fallback: ButtonColor;
};

export const BUTTON_CATALOG: ButtonDef[] = [
  { key: "products", label: "View products / Buy more", group: "Main menu", fallback: "green" },
  { key: "wallet", label: "Wallet", group: "Main menu", fallback: "blue" },
  { key: "profile", label: "Profile", group: "Main menu", fallback: "blue" },
  { key: "reviews", label: "Reviews", group: "Main menu", fallback: "blue" },
  { key: "refer", label: "Refer & earn", group: "Main menu", fallback: "blue" },
  { key: "support", label: "Support", group: "Main menu", fallback: "red" },
  { key: "orders", label: "Orders", group: "Main menu", fallback: "blue" },
  { key: "apikey", label: "Reseller API key", group: "Main menu", fallback: "blue" },
  { key: "home", label: "Back to menu / Skip / Cancel", group: "Main menu", fallback: "blue" },
  { key: "url", label: "Website link buttons", group: "Main menu", fallback: "blue" },

  { key: "p:*", label: "Product in the list", group: "Shopping", fallback: "blue" },
  { key: "b:*", label: "Buy now", group: "Shopping", fallback: "green" },
  { key: "rev_new", label: "Write a review", group: "Shopping", fallback: "green" },

  { key: "dep", label: "Deposit", group: "Wallet & profile", fallback: "green" },
  { key: "wd", label: "Withdraw", group: "Wallet & profile", fallback: "red" },
  { key: "whist", label: "Wallet history", group: "Wallet & profile", fallback: "blue" },
  { key: "setmail", label: "Set email", group: "Wallet & profile", fallback: "blue" },
  { key: "apikey_new", label: "Generate new API key", group: "Wallet & profile", fallback: "green" },

  { key: "a:home", label: "Admin home / back", group: "Admin panel", fallback: "blue" },
  { key: "a:prod", label: "Admin products", group: "Admin panel", fallback: "blue" },
  { key: "a:orders", label: "Admin orders", group: "Admin panel", fallback: "blue" },
  { key: "a:users", label: "Admin users", group: "Admin panel", fallback: "blue" },
  { key: "a:req", label: "Admin requests", group: "Admin panel", fallback: "blue" },
  { key: "a:stats", label: "Admin stats", group: "Admin panel", fallback: "blue" },
  { key: "a:set", label: "Admin settings", group: "Admin panel", fallback: "blue" },
  { key: "a:bc", label: "Broadcast", group: "Admin panel", fallback: "blue" },
  { key: "a:fj", label: "Force join channel", group: "Admin panel", fallback: "blue" },
  { key: "a:fjoff", label: "Turn force join off", group: "Admin panel", fallback: "red" },
  { key: "a:rc", label: "Review channel", group: "Admin panel", fallback: "blue" },
  { key: "a:em", label: "Emoji menu / back", group: "Admin panel", fallback: "blue" },
  { key: "a:em:web", label: "Website emojis", group: "Admin panel", fallback: "blue" },
  { key: "a:em:norm", label: "Normal emojis", group: "Admin panel", fallback: "blue" },
  { key: "a:em:btn", label: "Button emojis", group: "Admin panel", fallback: "blue" },
  { key: "a:em:prod", label: "Product emojis", group: "Admin panel", fallback: "blue" },
  { key: "a:emk:*", label: "Single emoji slot", group: "Admin panel", fallback: "blue" },
  { key: "a:emp:*", label: "Single product emoji", group: "Admin panel", fallback: "blue" },
  { key: "a:s:*", label: "Edit a setting", group: "Admin panel", fallback: "blue" },

  { key: "a:pd:*", label: "Change delivery mode", group: "Admin actions", fallback: "blue" },
  { key: "a:pp:*", label: "Change price", group: "Admin actions", fallback: "blue" },
  { key: "a:ps:*", label: "Add stock", group: "Admin actions", fallback: "green" },
  { key: "a:ra:*", label: "Approve request", group: "Admin actions", fallback: "green" },
  { key: "a:rr:*", label: "Reject request", group: "Admin actions", fallback: "red" },
  { key: "a:dl:*", label: "Complete delivery", group: "Admin actions", fallback: "green" },
  { key: "a:oc:*", label: "Cancel & refund order", group: "Admin actions", fallback: "red" },
  { key: "a:ua:*", label: "Make / remove admin", group: "Admin actions", fallback: "blue" },
  { key: "a:uw:*", label: "Set wallet balance", group: "Admin actions", fallback: "blue" },
];

export type ButtonColorMap = Partial<Record<string, ButtonColor>>;

/** Find which catalog entry a button belongs to. */
export function buttonKeyFor(btn: { callback_data?: string; url?: string }): string | undefined {
  if (btn.url) return "url";
  const data = btn.callback_data;
  if (!data) return undefined;
  let best: string | undefined;
  for (const def of BUTTON_CATALOG) {
    if (def.key === "url") continue;
    const re = new RegExp(`^${def.key.split("*").join("[^:]*").replace(/\+/g, "\\+")}$`);
    if (re.test(data) && (!best || def.key.length > best.length)) best = def.key;
  }
  return best;
}

/** Telegram button style for a colour, or undefined for "no colour". */
export function styleForColor(color: ButtonColor | undefined) {
  if (color === "green") return "success" as const;
  if (color === "red") return "danger" as const;
  if (color === "blue") return "primary" as const;
  return undefined;
}
