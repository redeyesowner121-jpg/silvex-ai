import { useEffect, useMemo, useState } from "react";
import { onValue, ref, set, update } from "firebase/database";
import { Bot, Boxes, Check, Palette, Search, Smile, Type } from "lucide-react";
import { useStore } from "@/context/StoreContext";
import {
  BUTTON_CATALOG,
  BUTTON_COLORS,
  type ButtonColor,
  type ButtonColorMap,
  type ButtonNameMap,
  type ProductButtonMap,
} from "@/lib/button-colors";
import { BOT_EMOJI_SLOTS } from "@/lib/web-emoji";

type Tab = "colours" | "names" | "emojis" | "products";
type EmojiEntry = { char?: string; id?: string; label?: string };

const tabs: { id: Tab; label: string; icon: typeof Palette }[] = [
  { id: "colours", label: "Colours", icon: Palette },
  { id: "names", label: "Names", icon: Type },
  { id: "emojis", label: "Emojis", icon: Smile },
  { id: "products", label: "Products", icon: Boxes },
];
const groups = [...new Set(BUTTON_CATALOG.map((button) => button.group))];
const field = "min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function ColourPicker({ value, onChange }: { value: ButtonColor; onChange: (value: ButtonColor) => void }) {
  return (
    <div className="flex shrink-0 gap-1" aria-label="Button colour">
      {BUTTON_COLORS.map((colour) => (
        <button
          key={colour.value}
          type="button"
          title={colour.label}
          aria-label={colour.label}
          onClick={() => onChange(colour.value)}
          className={`grid h-8 w-8 place-items-center rounded-lg border text-sm ${value === colour.value ? "border-primary bg-primary/10" : "border-border bg-background"}`}
        >
          {colour.dot}
        </button>
      ))}
    </div>
  );
}

export function ButtonsAdmin() {
  const { db, products, notify } = useStore();
  const [tab, setTab] = useState<Tab>("colours");
  const [group, setGroup] = useState(groups[0]);
  const [search, setSearch] = useState("");
  const [colors, setColors] = useState<ButtonColorMap>({});
  const [names, setNames] = useState<ButtonNameMap>({});
  const [productButtons, setProductButtons] = useState<ProductButtonMap>({});
  const [slotEmojis, setSlotEmojis] = useState<Record<string, EmojiEntry>>({});
  const [productEmojis, setProductEmojis] = useState<Record<string, EmojiEntry>>({});
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!db) return;
    const cleanups = [
      onValue(ref(db, "site_settings/button_colors"), (snapshot) => setColors(snapshot.val() || {})),
      onValue(ref(db, "site_settings/button_names"), (snapshot) => setNames(snapshot.val() || {})),
      onValue(ref(db, "site_settings/product_buttons"), (snapshot) => setProductButtons(snapshot.val() || {})),
      onValue(ref(db, "telegramEmoji/slots"), (snapshot) => setSlotEmojis(snapshot.val() || {})),
      onValue(ref(db, "telegramEmoji/products"), (snapshot) => setProductEmojis(snapshot.val() || {})),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [db]);

  const flashSaved = (message = "Saved") => {
    setSaved(message);
    window.setTimeout(() => setSaved(""), 1500);
  };

  const saveMapValue = async (path: string, key: string, value: unknown) => {
    if (!db) return;
    await set(ref(db, `${path}/${key}`), value);
    flashSaved();
  };

  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter((product) => product.title && product.title.toLowerCase().includes(query))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [products, search]);

  const setAllColours = async (color: ButtonColor) => {
    if (!db) return;
    const all = Object.fromEntries(BUTTON_CATALOG.map((button) => [button.key, color]));
    setColors(all);
    await set(ref(db, "site_settings/button_colors"), all);
    flashSaved("All colours saved");
  };

  const saveEmoji = async (slot: string, char: string) => {
    if (!db) return;
    const key = slot.replaceAll(".", "~");
    const current = slotEmojis[key] || {};
    const fallback = BOT_EMOJI_SLOTS[slot]?.char || "";
    if (!char.trim() || char.trim() === fallback) await set(ref(db, `telegramEmoji/slots/${key}`), null);
    else await update(ref(db, `telegramEmoji/slots/${key}`), { ...current, char: char.trim(), label: BOT_EMOJI_SLOTS[slot]?.label || slot });
    flashSaved();
  };

  const saveProductEmoji = async (productId: string, char: string) => {
    if (!db) return;
    const key = productId.replaceAll(".", "~");
    const current = productEmojis[key] || {};
    if (!char.trim()) await set(ref(db, `telegramEmoji/products/${key}`), null);
    else await update(ref(db, `telegramEmoji/products/${key}`), { ...current, char: char.trim() });
    flashSaved();
  };

  const shownButtons = BUTTON_CATALOG.filter((button) => button.group === group);
  const buttonEmojiSlots = Object.entries(BOT_EMOJI_SLOTS).filter(([, value]) => value.group === "button");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-card p-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[10px] font-bold sm:flex-row sm:justify-center sm:text-xs ${tab === id ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {saved ? <p className="flex items-center justify-center gap-1 text-xs font-bold text-primary"><Check className="h-3.5 w-3.5" />{saved}</p> : null}

      {tab === "colours" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
            <div><p className="text-sm font-black">Set every button</p><p className="text-xs text-muted-foreground">Choose one colour for all.</p></div>
            <ColourPicker value="none" onChange={setAllColours} />
          </div>
          <select value={group} onChange={(event) => setGroup(event.target.value as typeof group)} className={`${field} w-full`}>
            {groups.map((item) => <option key={item}>{item}</option>)}
          </select>
          <div className="max-h-[48vh] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card">
            {shownButtons.map((button) => (
              <div key={button.key} className="flex items-center justify-between gap-3 p-3">
                <p className="min-w-0 text-sm font-bold">{button.label}</p>
                <ColourPicker value={colors[button.key] ?? button.fallback} onChange={(color) => { setColors((current) => ({ ...current, [button.key]: color })); void saveMapValue("site_settings/button_colors", button.key, color); }} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "names" ? (
        <section className="space-y-3">
          <select value={group} onChange={(event) => setGroup(event.target.value as typeof group)} className={`${field} w-full`}>
            {groups.map((item) => <option key={item}>{item}</option>)}
          </select>
          <div className="max-h-[56vh] space-y-2 overflow-y-auto rounded-xl border border-border bg-card p-3">
            {shownButtons.map((button) => (
              <label key={button.key} className="block">
                <span className="mb-1 block text-xs font-bold text-muted-foreground">{button.label}</span>
                <div className="flex gap-2">
                  <input className={field} value={names[button.key] || ""} placeholder="Keep current bot name" onChange={(event) => setNames((current) => ({ ...current, [button.key]: event.target.value }))} />
                  <button type="button" onClick={() => void saveMapValue("site_settings/button_names", button.key, names[button.key]?.trim() || null)} className="rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground">Save</button>
                </div>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "emojis" ? (
        <section className="max-h-[64vh] space-y-2 overflow-y-auto rounded-xl border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Change the visible emoji here. Existing premium emoji IDs stay connected.</p>
          {buttonEmojiSlots.map(([slot, definition]) => {
            const key = slot.replaceAll(".", "~");
            return (
              <label key={slot} className="flex items-center gap-3 rounded-lg bg-muted/50 p-2">
                <span className="min-w-0 flex-1 text-sm font-bold">{definition.label}</span>
                <input className="h-9 w-16 rounded-lg border border-border bg-background text-center text-lg" value={slotEmojis[key]?.char ?? definition.char} onChange={(event) => setSlotEmojis((current) => ({ ...current, [key]: { ...current[key], char: event.target.value } }))} />
                <button type="button" onClick={() => void saveEmoji(slot, slotEmojis[key]?.char ?? definition.char)} className="h-9 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground">Save</button>
              </label>
            );
          })}
        </section>
      ) : null}

      {tab === "products" ? (
        <section className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input type="search" className={`${field} w-full pl-9`} placeholder="Search product buttons" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="max-h-[58vh] space-y-2 overflow-y-auto rounded-xl border border-border bg-card p-3">
            {visibleProducts.map((product) => {
              const setting = productButtons[product.id] || {};
              const emojiKey = product.id.replaceAll(".", "~");
              return (
                <div key={product.id} className="space-y-2 rounded-lg bg-muted/50 p-3">
                  <p className="truncate text-sm font-black">{product.title}</p>
                  <div className="flex gap-2">
                    <input className={field} value={setting.name || ""} placeholder="Bot button name" onChange={(event) => setProductButtons((current) => ({ ...current, [product.id]: { ...setting, name: event.target.value } }))} />
                    <input className="h-9 w-16 rounded-lg border border-border bg-background text-center text-lg" value={productEmojis[emojiKey]?.char || ""} placeholder="🛍" onChange={(event) => setProductEmojis((current) => ({ ...current, [emojiKey]: { ...current[emojiKey], char: event.target.value } }))} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <ColourPicker value={setting.color || "blue"} onChange={(color) => setProductButtons((current) => ({ ...current, [product.id]: { ...setting, color } }))} />
                    <button type="button" onClick={async () => { await saveMapValue("site_settings/product_buttons", product.id, { name: setting.name?.trim() || undefined, color: setting.color || "blue" }); await saveProductEmoji(product.id, productEmojis[emojiKey]?.char || ""); }} className="flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"><Bot className="h-3.5 w-3.5" /> Save</button>
                  </div>
                </div>
              );
            })}
            {!visibleProducts.length ? <p className="py-8 text-center text-sm text-muted-foreground">No products found.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}