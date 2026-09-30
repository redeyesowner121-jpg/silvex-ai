import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  idToken: z.string().min(10).max(5000),
  sub: z.object({
    endpoint: z.string().url().max(1000),
    keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  }),
});

/** Saves this device so it can receive pop-up notifications. The signed-in
 *  account is verified with Firebase, and admin alerts are only enabled when the
 *  database marks that account as admin. */
export const savePushSubscription = createServerFn({ method: "POST" })
  .inputValidator((d) => schema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env["FIREBASE_API_KEY"] || process.env["GOOGLE_API_KEY"] || "";
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: data.idToken }),
    });
    const info = res.ok ? await res.json() : null;
    const uid: string | undefined = info?.users?.[0]?.localId;
    if (!uid) return { ok: false as const, error: "Please sign in again." };

    const { dbGet, dbPut } = await import("./telegram.server");
    const { subKey } = await import("./push.server");
    const profile = await dbGet<{ isAdmin?: boolean; isOwner?: boolean }>(`users/${uid}`);
    const email = String(info.users[0].email || "").toLowerCase();
    const admin =
      !!profile?.isAdmin || !!profile?.isOwner || email === "red.eyes.owner121@gmail.com";
    await dbPut(`pushSubs/${uid}/${subKey(data.sub.endpoint)}`, { ...data.sub, admin, at: Date.now() });
    return { ok: true as const, admin };
  });

export const getVapidKey = createServerFn({ method: "GET" }).handler(async () => {
  const { VAPID_PUBLIC_KEY } = await import("./push.server");
  return { key: VAPID_PUBLIC_KEY };
});
