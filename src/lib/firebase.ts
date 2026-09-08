import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Database } from "firebase/database";
import { getFirebaseConfig } from "./firebase.functions";

export type FirebaseBundle = { app: FirebaseApp; auth: Auth; db: Database };

let cached: FirebaseBundle | null = null;
let pending: Promise<FirebaseBundle> | null = null;
const CONFIG_CACHE = "store_firebase_config";

type WebConfig = Awaited<ReturnType<typeof getFirebaseConfig>>;

async function loadConfig(): Promise<WebConfig> {
  try {
    const saved = localStorage.getItem(CONFIG_CACHE);
    if (saved) return JSON.parse(saved) as WebConfig;
  } catch {
    /* storage unavailable */
  }
  const config = await getFirebaseConfig();
  if (config.apiKey) {
    try {
      localStorage.setItem(CONFIG_CACHE, JSON.stringify(config));
    } catch {
      /* storage unavailable */
    }
  }
  return config;
}

async function init(): Promise<FirebaseBundle> {
  const [config, firebaseApp, firebaseAuth, firebaseDatabase] = await Promise.all([
    loadConfig(),
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/database"),
  ]);


  const app = firebaseApp.getApps()[0] ?? firebaseApp.initializeApp(config);
  const bundle: FirebaseBundle = {
    app,
    auth: firebaseAuth.getAuth(app),
    db: firebaseDatabase.getDatabase(app),
  };

  cached = bundle;
  // Analytics is optional and must never delay products, auth, or the first paint.
  void import("firebase/analytics")
    .then(async ({ isSupported, getAnalytics }) => {
      if (await isSupported()) getAnalytics(app);
    })
    .catch(() => undefined);
  return bundle;
}

export function getFirebase(): Promise<FirebaseBundle> {
  if (cached) return Promise.resolve(cached);
  if (!pending) pending = init();
  return pending;
}
