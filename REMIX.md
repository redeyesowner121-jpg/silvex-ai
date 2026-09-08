# Remix this store

Everything below can be changed without touching code.

## 1. Point it at your own database (optional but recommended)

Create a free Firebase project (Realtime Database + Email/Password + Google sign-in),
then add these project secrets:

| Secret | Example |
| --- | --- |
| `FIREBASE_API_KEY` (or `GOOGLE_API_KEY`) | `AIza...` |
| `FIREBASE_PROJECT_ID` | `my-store` |
| `FIREBASE_DATABASE_URL` | `https://my-store-default-rtdb.firebaseio.com` |
| `FIREBASE_AUTH_DOMAIN` | `my-store.firebaseapp.com` |
| `FIREBASE_STORAGE_BUCKET` | `my-store.firebasestorage.app` |
| `FIREBASE_MESSAGING_SENDER_ID` | `1234567890` |
| `FIREBASE_APP_ID` | `1:1234567890:web:abcdef` |
| `FIREBASE_MEASUREMENT_ID` | `G-XXXXXXX` |

Add your published domain to Firebase → Authentication → Settings → Authorized domains.

## 2. Sign in and open `/admin`

The first owner email is set in code (`FIXED_OWNER_EMAIL` in
`src/context/StoreContext.tsx`) — change that single line to your own email when
you remix, then add any other owners from Settings.

## 3. Set everything from Settings

- Store name, tagline, logo, banners, notices, categories, fees, minimum order
- Website address, referral percentage and cap, owner emails
- Deposit wallet address and QR
- SMTP (Spacemail or any provider) for order and delivery emails
- Telegram bot token from BotFather + bot username → press
  **Save & connect Telegram bot**. It verifies the token and registers the
  webhook automatically, no code or connector needed.
- Telegram owner IDs, bot button colours, premium emojis

Products, stock, coupons, users and orders are all managed from the admin panel
too, on the website and inside the bot (`/admin`).
