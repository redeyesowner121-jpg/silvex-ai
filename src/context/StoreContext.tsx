import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Context,
} from "react";
import type { Auth, User } from "firebase/auth";
import type { Database } from "firebase/database";
import { toast } from "sonner";
import { getFirebase } from "@/lib/firebase";
import { isOriginProject } from "@/lib/origin";
import { applyReferralConfig } from "@/lib/referral";
import { slotChar } from "@/lib/web-emoji";
import { readStoreSnapshot } from "@/context/store-prime";

export type Product = {
  id: string;
  title: string;
  desc?: string;
  price: number;
  logo?: string;
  type?: string;
  link?: string;
  salesCount?: number;
  /** auto = one stock line per unit, repeat = same link, manual = admin delivers, supplier = bought live from the supplier shop */
  delivery?: "auto" | "repeat" | "manual" | "supplier";
  stock?: string[];
  usedStock?: Record<string, { content: string; orderId?: string; email?: string; date?: string }>;
  /** Linked supplier shop product (price and stock follow the supplier automatically) */
  supplierId?: string | number;
  /** Selling price = supplier price × this percent (e.g. 130 = +30%) */
  markup?: number;
  supplierPrice?: number;
  supplierStock?: number;
  supplierSyncedAt?: string;
  /** Which reseller API shop this item comes from */
  provider?: string;
  providerName?: string;
  /** Hidden products are only visible in the admin panel */
  hidden?: boolean;
  /** Out of stock products stay listed but cannot be bought */
  soldOut?: boolean;
  /** Imported API products cannot be deleted, only hidden */
  locked?: boolean;
};


export type CartItem = Product & {
  qty: number;
  originalPrice: number;
  discountLabel?: string | null | undefined;
};

export type Profile = {
  name?: string;
  email?: string;
  wallet?: number;
  phone?: string;
  myRefCode?: string;
  usedRef?: string;
  refBy?: string;
  refEarned?: Record<string, number>;
  history?: Record<string, { type?: string; amount?: number; date?: string; desc?: string }>;
  lastBonus?: string;
  isAdmin?: boolean;
  isOwner?: boolean;
  ownerRevoked?: boolean;
};

export type Category = { label: string; icon?: string };
export type SiteConfig = {
  qr?: string;
  fee?: number;
  marquee?: string;
  siteName?: string;
  siteTagline?: string;
  depositAddress?: string;
  supportLink?: string;
  /** Telegram support username or link (e.g. @silvexai). */
  supportTelegram?: string;
  minOrder?: number;
  lowStockAlert?: number;
  categories?: Category[];
  /** Public website address, used for links, referrals and the reseller API. */
  siteUrl?: string;
  /** Telegram bot username, without the @. */
  botUsername?: string;
  /** Telegram bot token from BotFather (set in the admin panel). */
  botToken?: string;
  /** Referral commission percent (e.g. 2) and the cap per referred friend. */
  referralRate?: number;
  referralCap?: number;
  /** Emails that always keep owner access, comma separated in the admin panel. */
  ownerEmails?: string;
  /** Telegram numeric IDs of the bot owners, comma separated. */
  telegramOwners?: string;
  /** Supplier shop reseller API (address + key), set in the admin panel. */
  supplierApiUrl?: string;
  supplierApiKey?: string;
  /** Razorpay card/UPI deposits, set in the admin panel. */
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayWebhookSecret?: string;
  /** Rupees that equal one dollar (default 100). */
  inrPerDollar?: number;
  /** Extra verification fee added on card/UPI payments, in percent (default 3). */
  razorpayFeePercent?: number;
  razorpayVerifyFeePercent?: number;

};

export const DEFAULT_CATEGORIES: Category[] = [
  { label: "Service", icon: "⚡" },
  { label: "Method", icon: "📘" },
  { label: "Earning", icon: "💸" },
  { label: "Free", icon: "🎁" },
];

export type Banner = { title?: string; desc?: string; link?: string };
export type FlashSale = { pid?: string; price?: number; endTime?: number } | null;
export type NoticeItem = { id: string; msg: string; date?: string };

export type ModalName =
  | "auth"
  | "profile"
  | "wallet"
  | "product"
  | "notifications"
  | "suggestion"
  | null;

type StoreValue = {
  ready: boolean;
  auth: Auth | null;
  db: Database | null;
  user: User | null;
  profile: Profile | null;
  wallet: number;
  isAdmin: boolean;
  products: Product[];
  config: SiteConfig;
  categories: Category[];
  siteName: string;
  emoji: (key: string) => string;
  emojiImg: (key: string) => string;
  /** Same emoji everywhere: built-in character -> what the admin picked. */
  emojiFor: (char: string) => { char: string; img?: string };
  /** Emoji the bot admin picked for one product (with premium artwork). */
  productEmoji: (productId: string) => { char: string; img?: string };

  banner: Banner;
  flashSale: FlashSale;
  notices: NoticeItem[];
  cart: CartItem[];
  cartCount: number;
  cartTotal: number;
  addToCart: (product: Product, flashPrice?: number | null) => void;
  setQty: (id: string, qty: number) => void;
  clearCart: () => void;
  modal: ModalName;
  openModal: (name: Exclude<ModalName, null>) => void;
  closeModal: () => void;
  activeProductId: string | null;
  openProduct: (id: string) => void;
  success: { title: string; desc: string } | null;
  showSuccess: (title: string, desc: string) => void;
  closeSuccess: () => void;
  notify: (msg: string) => void;
};

// Keep one context instance across hot reloads so the provider and consumers
// never end up on two different copies of this module.
const g = globalThis as unknown as { __rkrStoreContext?: Context<StoreValue | null> };
const StoreContext = g.__rkrStoreContext ?? createContext<StoreValue | null>(null);
g.__rkrStoreContext = StoreContext;

const CART_KEY = "rkr_cart_v1";

/** Store owners of the ORIGINAL database only. A new Firebase project starts with none. */
export const DEFAULT_OWNER_EMAILS = [
  "red.eyes.owner121@gmail.com",
  "mohiuddinarif0278@gmail.com",
];
/** Permanent owner of the original store; ignored on any other database. */
export const FIXED_OWNER_EMAIL = "red.eyes.owner121@gmail.com";
let ownerEmails: string[] = [];

export function applyOwnerEmails(list?: string | string[] | null) {
  const parsed = (Array.isArray(list) ? list : String(list ?? "").split(/[,\s]+/))
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);
  ownerEmails = parsed.length ? parsed : isOriginProject() ? [...DEFAULT_OWNER_EMAILS] : [];
  if (isOriginProject() && !ownerEmails.includes(FIXED_OWNER_EMAIL)) {
    ownerEmails = [FIXED_OWNER_EMAIL, ...ownerEmails];
  }
}

export function isFixedOwner(email?: string | null) {
  if (!isOriginProject()) return false;
  return String(email ?? "").trim().toLowerCase() === FIXED_OWNER_EMAIL;
}

export function isOwnerEmail(email?: string | null) {
  return isFixedOwner(email) || Boolean(email && ownerEmails.includes(email.toLowerCase()));
}


export function StoreProvider({ children }: { children: ReactNode }) {
  // Shop data that came with the page HTML: shown instantly, then kept live.
  const snap = readStoreSnapshot();
  const snapProducts: Product[] = Object.entries(snap?.products || {}).map(([id, p]: any) => ({
    id,
    ...(p as Omit<Product, "id">),
    price: Number(p?.price) || 0,
  }));
  const decodeDots = (v: Record<string, any> | null | undefined) =>
    Object.fromEntries(Object.entries(v || {}).map(([k, val]) => [k.split("~").join("."), val]));
  if (snap?.config) {
    applyOwnerEmails((snap.config as SiteConfig).ownerEmails);
    applyReferralConfig(snap.config as SiteConfig);
  }

  const [auth, setAuth] = useState<Auth | null>(null);
  const [db, setDb] = useState<Database | null>(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>(snapProducts);
  const [config, setConfig] = useState<SiteConfig>((snap?.config || {}) as SiteConfig);
  // The emoji the admin picked for one named place (e.g. just the Orders tab).
  const [slotEmojis, setSlotEmojis] = useState<Record<string, { char?: string; id?: string }>>(
    decodeDots(snap?.emojis),
  );
  const [slotEmojiImgs, setSlotEmojiImgs] = useState<Record<string, string>>({});
  const [prodEmojis, setProdEmojis] = useState<Record<string, { char?: string; id?: string; img?: string }>>(
    decodeDots(snap?.prodEmojis),
  );
  const [prodEmojiImgs, setProdEmojiImgs] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner>((snap?.banner || {}) as Banner);
  const [flashSale, setFlashSale] = useState<FlashSale>((snap?.flashSale || null) as FlashSale);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [myAlerts, setMyAlerts] = useState<NoticeItem[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [modal, setModal] = useState<ModalName>(null);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ title: string; desc: string } | null>(null);
  const mounted = useRef(true);

  // Restore cart from the browser
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) setCart(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Keep supplier-linked products' price and stock fresh (at most once every 5 min)
  useEffect(() => {
    const t = setTimeout(() => {
      import("@/lib/supplier.functions")
        .then((m) => m.autoSyncSupplier())
        .catch(() => undefined);
    }, 2500);
    return () => clearTimeout(t);
  }, []);


  useEffect(() => {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart]);

  // Boot Firebase + global listeners
  useEffect(() => {
    mounted.current = true;
    let unsubs: Array<() => void> = [];

    (async () => {
      const { auth: a, db: d } = await getFirebase();
      const { onAuthStateChanged } = await import("firebase/auth");
      const { ref, onValue } = await import("firebase/database");
      if (!mounted.current) return;
      setAuth(a);
      setDb(d);

      unsubs.push(
        onAuthStateChanged(a, (u) => {
          setUser(u);
          setReady(true);
        }),
      );
      unsubs.push(
        onValue(ref(d, "products"), (snap) => {
          const val = snap.val() || {};
          setProducts(
            Object.entries(val).map(([id, p]) => ({
              id,
              ...(p as Omit<Product, "id">),
              price: Number((p as Product).price) || 0,
            })),
          );
        }),
      );
      unsubs.push(onValue(ref(d, "site_settings/config"), (s) => {
          const c = (s.val() || {}) as SiteConfig;
          applyOwnerEmails(c.ownerEmails);
          applyReferralConfig(c);
          setConfig(c);
        }));
      // Product ids hold dots, stored as "~" because Firebase keys can't have dots.
      const decodeKeys = (v: Record<string, any> | null) =>
        Object.fromEntries(Object.entries(v || {}).map(([k, val]) => [k.split("~").join("."), val]));
      // The emoji chosen for each named place in the bot and website.
      unsubs.push(onValue(ref(d, "telegramEmoji/slots"), (s) => setSlotEmojis(decodeKeys(s.val()))));
      // Emojis the bot admin picked for single products.
      unsubs.push(onValue(ref(d, "telegramEmoji/products"), (s) => setProdEmojis(decodeKeys(s.val()))));
      // Premium emoji artwork can be heavy, so it loads after the first paint.
      const loadArt = () => {
        unsubs.push(
          onValue(ref(d, "telegramEmoji/slotimg"), (s) => setSlotEmojiImgs(decodeKeys(s.val()))),
        );
        unsubs.push(
          onValue(ref(d, "telegramEmoji/prodimg"), (s) => setProdEmojiImgs(decodeKeys(s.val()))),
        );
      };



      if (typeof requestIdleCallback === "function") requestIdleCallback(() => loadArt());
      else setTimeout(loadArt, 1500);
      unsubs.push(onValue(ref(d, "site_settings/banner"), (s) => setBanner(s.val() || {})));
      unsubs.push(onValue(ref(d, "site_settings/flash_sale"), (s) => setFlashSale(s.val() || null)));
      unsubs.push(
        onValue(ref(d, "notifications"), (s) => {
          const val = s.val() || {};
          setNotices(
            Object.entries(val)
              .map(([id, n]) => ({ id, ...(n as Omit<NoticeItem, "id">) }))
              .reverse(),
          );
        }),
      );
    })().catch(() => setReady(true));

    return () => {
      mounted.current = false;
      unsubs.forEach((u) => u());
      unsubs = [];
    };
  }, []);

  // Per-user profile listener
  useEffect(() => {
    if (!db || !user) {
      setProfile(null);
      return;
    }
    let unsub = () => {};
    (async () => {
      const { ref, onValue, update, get } = await import("firebase/database");

      // Self-heal: if the account exists in Firebase Auth but has no profile row
      // (interrupted signup, Google redirect sign-in, etc.) create it now so the
      // user is never stuck in a half-registered state.
      const existing = await get(ref(db, `users/${user.uid}`)).catch(() => null);
      if (!existing?.exists()) {
        const base = (user.displayName || user.email || "USR").replace(/[^a-zA-Z]/g, "") || "USR";
        await update(ref(db, `users/${user.uid}`), {
          name: user.displayName || user.email?.split("@")[0] || "User",
          email: user.email || "",
          wallet: 0,
          myRefCode: (base.slice(0, 3) + Math.floor(100 + Math.random() * 900)).toUpperCase(),
          joined: new Date().toISOString(),
        }).catch(() => {});
      }

      const offProfile = onValue(ref(db, `users/${user.uid}`), (s) => setProfile(s.val() || {}));
      const offAlerts = onValue(ref(db, `users/${user.uid}/alerts`), (s) => {
        const val = (s.val() || {}) as Record<string, { msg?: string; date?: string }>;
        setMyAlerts(
          Object.entries(val)
            .map(([id, n]) => ({ id, msg: String(n?.msg || ""), date: String(n?.date || "") }))
            .filter((n) => n.msg)
            .reverse()
            .slice(0, 30),
        );
      });
      unsub = () => {
        offProfile();
        offAlerts();
      };
      if (isFixedOwner(user.email)) {
        update(ref(db, `users/${user.uid}`), {
          isAdmin: true,
          isOwner: true,
          ownerRevoked: null,
        }).catch(() => {});
      } else if (isOwnerEmail(user.email)) {
        const snap = await get(ref(db, `users/${user.uid}/ownerRevoked`)).catch(() => null);
        if (!snap?.val()) {
          update(ref(db, `users/${user.uid}`), { isAdmin: true, isOwner: true }).catch(() => {});
        }
      }

      // Brand-new database: the very first account to sign in becomes the owner,
      // so a fresh Firebase project needs no code change at all.
      if (!isOriginProject() && user.email) {
        const claimed = await get(ref(db, "site_settings/bootstrapOwner")).catch(() => null);
        const owners = await get(ref(db, "site_settings/config/ownerEmails")).catch(() => null);
        if (!claimed?.exists() && !String(owners?.val() ?? "").trim()) {
          await update(ref(db, "site_settings"), {
            bootstrapOwner: user.uid,
            "config/ownerEmails": user.email.toLowerCase(),
          }).catch(() => {});
          await update(ref(db, `users/${user.uid}`), {
            isAdmin: true,
            isOwner: true,
            ownerRevoked: null,
          }).catch(() => {});
        }
      }
    })();

    return () => unsub();
  }, [db, user]);

  const notify = useCallback((msg: string) => toast(msg), []);

  const addToCart = useCallback(
    (product: Product, flashPrice?: number | null) => {
      if (!user) {
        setModal("auth");
        return;
      }
      if (product.soldOut) {
        toast("This product is out of stock");
        return;
      }
      const price = flashPrice != null ? Number(flashPrice) : Number(product.price);
      setCart((prev) => {
        const existing = prev.find((i) => i.id === product.id);
        if (existing) {
          return prev.map((i) =>
            i.id === product.id
              ? {
                  ...i,
                  qty: i.qty + 1,
                  price,
                  discountLabel: flashPrice != null ? "⚡ Flash Sale" : i.discountLabel,
                }
              : i,
          );
        }
        return [
          ...prev,
          {
            ...product,
            price,
            originalPrice: Number(product.price),
            discountLabel: flashPrice != null ? "⚡ Flash Sale" : null,
            qty: 1,
          },
        ];
      });
      setSuccess({ title: "Added", desc: "Item added to your cart." });
    },
    [user],
  );

  const setQty = useCallback((id: string, qty: number) => {
    setCart((prev) =>
      qty <= 0 ? prev.filter((i) => i.id !== id) : prev.map((i) => (i.id === id ? { ...i, qty } : i)),
    );
  }, []);

  const value = useMemo<StoreValue>(() => {
    const cartTotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    return {
      ready,
      auth,
      db,
      user,
      profile,
      wallet: Number(profile?.wallet ?? 0),
      isAdmin: isFixedOwner(user?.email)
        ? true
        : profile?.ownerRevoked
          ? Boolean(profile?.isAdmin)
          : Boolean(profile?.isAdmin) || isOwnerEmail(user?.email),
      products,
      config,
      categories:
        Array.isArray(config.categories) && config.categories.length
          ? config.categories
          : DEFAULT_CATEGORIES,
      siteName: config.siteName || (isOriginProject() ? "SILENT SELLER" : "My Store"),
      // Every place keeps its own emoji; nothing is guessed from the character.
      emoji: (key: string) => slotEmojis[key]?.char || slotChar(key),
      emojiImg: (key: string) => (slotEmojis[key] ? slotEmojiImgs[key] || "" : ""),
      emojiFor: (char: string) => ({ char }),
      productEmoji: (productId: string) => {
        const saved = prodEmojis[productId];
        const char = saved?.char || "";
        if (!char) return { char: "" };
        return { char, img: prodEmojiImgs[productId] || saved?.img || "" };
      },


      banner,
      flashSale,
      notices: [...myAlerts, ...notices],
      cart,
      cartCount: cart.reduce((n, i) => n + i.qty, 0),
      cartTotal,
      addToCart,
      setQty,
      clearCart: () => setCart([]),
      modal,
      openModal: (name) => setModal(name),
      closeModal: () => setModal(null),
      activeProductId,
      openProduct: (id) => {
        setActiveProductId(id);
        setModal("product");
      },
      success,
      showSuccess: (title, desc) => setSuccess({ title, desc }),
      closeSuccess: () => setSuccess(null),
      notify,
    };
  }, [
    ready,
    auth,
    db,
    user,
    profile,
    products,
    config,
    slotEmojis,
    slotEmojiImgs,
    prodEmojis,
    prodEmojiImgs,
    banner,
    flashSale,
    notices,
    myAlerts,
    cart,
    modal,
    activeProductId,
    success,
    addToCart,
    setQty,
    notify,
  ]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}
