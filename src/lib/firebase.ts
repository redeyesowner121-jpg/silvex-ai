import type { FirebaseApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import type { Database } from "firebase/database";
import { getFirebaseApiKey } from "./firebase.functions";

export type FirebaseBundle = { app: FirebaseApp; auth: Auth; db: Database };

let cached: FirebaseBundle | null = null;
let pending: Promise<FirebaseBundle> | null = null;

async function init(): Promise<FirebaseBundle> {
  const [{ apiKey }, firebaseApp, firebaseAuth, firebaseDatabase] = await Promise.all([
    getFirebaseApiKey(),
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/database"),
  ]);

  const config = {
    apiKey,
    authDomain: "silvex-ai.firebaseapp.com",
    databaseURL: "https://silvex-ai-default-rtdb.firebaseio.com",
    projectId: "silvex-ai",
    storageBucket: "silvex-ai.firebasestorage.app",
    messagingSenderId: "343959828375",
    appId: "1:343959828375:web:6d2990763b1f3ea8b576d2",
    measurementId: "G-B1MPW2N31F",
  };

  const app = firebaseApp.getApps()[0] ?? firebaseApp.initializeApp(config);
  const bundle: FirebaseBundle = {
    app,
    auth: firebaseAuth.getAuth(app),
    db: firebaseDatabase.getDatabase(app),
  };

  // Analytics is browser-only and optional; never let it break the app.
  try {
    const { isSupported, getAnalytics } = await import("firebase/analytics");
    if (await isSupported()) getAnalytics(app);
  } catch {
    /* analytics unavailable */
  }

  cached = bundle;
  return bundle;
}

export function getFirebase(): Promise<FirebaseBundle> {
  if (cached) return Promise.resolve(cached);
  if (!pending) pending = init();
  return pending;
}
