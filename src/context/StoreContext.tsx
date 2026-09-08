import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Auth, User } from "firebase/auth";
import type { Database } from "firebase/database";
import { toast } from "sonner";
import { getFirebase } from "@/lib/firebase";

export type Product = {
  id: string;
  title: string;
  desc?: string;
  price: number;
  logo?: string;
  type?: string;
  link?: string;
  salesCount?: number;
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
  lastBonus?: string;
  isAdmin?: boolean;
};

export type SiteConfig = { qr?: string; fee?: number; marquee?: string };
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

const StoreContext = createContext<StoreValue | null>(null);

const CART_KEY = "rkr_cart_v1";

/** Store owners: always admin, cannot be removed. */
export const OWNER_EMAILS = ["red.eyes.owner121@gmail.com", "mohiuddinarif78@gmail.com"];

export function isOwnerEmail(email?: string | null) {
  return Boolean(email && OWNER_EMAILS.includes(email.toLowerCase()));
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [db, setDb] = useState<Database | null>(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [config, setConfig] = useState<SiteConfig>({});
  const [banner, setBanner] = useState<Banner>({});
  const [flashSale, setFlashSale] = useState<FlashSale>(null);
  const [notices, setNotices] = useState<NoticeItem[]>([]);
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
      unsubs.push(onValue(ref(d, "site_settings/config"), (s) => setConfig(s.val() || {})));
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
      const { ref, onValue, update } = await import("firebase/database");
      unsub = onValue(ref(db, `users/${user.uid}`), (s) => setProfile(s.val() || {}));
      if (isOwnerEmail(user.email)) {
        update(ref(db, `users/${user.uid}`), { isAdmin: true, isOwner: true }).catch(() => {});
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
      isAdmin: Boolean(profile?.isAdmin),
      products,
      config,
      banner,
      flashSale,
      notices,
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
    banner,
    flashSale,
    notices,
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
