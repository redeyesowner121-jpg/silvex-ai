import { createServerFn } from "@tanstack/react-start";

/**
 * Firebase web settings for this project. When this app is remixed, set the
 * FIREBASE_* project secrets to point it at another Firebase project — no code
 * change needed. Values below are only the defaults of the original store.
 */
export const getFirebaseConfig = createServerFn({ method: "GET" }).handler(async () => {
  const env = (k: string, fallback: string) => process.env[k] || fallback;
  const projectId = env("FIREBASE_PROJECT_ID", "silvex-ai");
  return {
    apiKey: process.env["FIREBASE_API_KEY"] || process.env["GOOGLE_API_KEY"] || "",
    authDomain: env("FIREBASE_AUTH_DOMAIN", `${projectId}.firebaseapp.com`),
    databaseURL: env("FIREBASE_DATABASE_URL", `https://${projectId}-default-rtdb.firebaseio.com`),
    projectId,
    storageBucket: env("FIREBASE_STORAGE_BUCKET", `${projectId}.firebasestorage.app`),
    messagingSenderId: env("FIREBASE_MESSAGING_SENDER_ID", "343959828375"),
    appId: env("FIREBASE_APP_ID", "1:343959828375:web:6d2990763b1f3ea8b576d2"),
    measurementId: env("FIREBASE_MEASUREMENT_ID", "G-B1MPW2N31F"),
  };
});

/** Kept for older callers. */
export const getFirebaseApiKey = createServerFn({ method: "GET" }).handler(async () => ({
  apiKey: process.env["FIREBASE_API_KEY"] || process.env["GOOGLE_API_KEY"] || "",
}));
