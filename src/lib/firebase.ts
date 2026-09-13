import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Database } from "firebase/database";
import { getFirebaseConfig } from "./firebase.functions";
import { setActiveProjectId } from "./origin";

export type FirebaseBundle = { app: FirebaseApp; auth: Auth; db: Database };

let cached: FirebaseBundle | null = null;
let pending: Promise<FirebaseBundle> | null = null;
const CONFIG_CACHE = "store_firebase_config";

type WebConfig = Awaited<ReturnType<typeof getFirebaseConfig>>;

/** Wipe browser-side leftovers so a new database starts the site completely fresh. */
function resetLocalState() {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    /* storage unavailable */
  }
}

/** Settings sent with the page itself, so the browser needs no extra request. */
let primed: WebConfig | null = null;
export function primeFirebaseConfig(config?: WebConfig | null) {
  if (config?.apiKey) primed = config;
}

async function loadConfig(): Promise<WebConfig> {
  let saved: WebConfig | null = null;
  try {
    const raw = localStorage.getItem(CONFIG_CACHE);
    if (raw) saved = JSON.parse(raw) as WebConfig;
  } catch {
    /* storage unavailable */
  }

  let config: WebConfig | null = primed;
  if (!config?.apiKey) {
    try {
      config = await getFirebaseConfig();
    } catch {
      config = null;
    }
  }
  if (!config?.apiKey) {
    if (saved) {
      setActiveProjectId(saved.projectId);
      return saved;
    }
    throw new Error("Store settings unavailable");
  }

  // The store was pointed at a different Firebase project: start over.
  if (saved && saved.projectId !== config.projectId) resetLocalState();

  setActiveProjectId(config.projectId);
  try {
    localStorage.setItem(CONFIG_CACHE, JSON.stringify(config));
  } catch {
    /* storage unavailable */
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
