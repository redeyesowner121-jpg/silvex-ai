# Remix this store

Change the Firebase project and the whole site starts over as a brand-new,
empty store. Nothing from the original shop carries over.

## 1. Point it at your own database

Create a free Firebase project (Realtime Database + Email/Password + Google sign-in),
then set these project secrets:

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

## 2. What happens automatically on a new database

- Old browser data (cart, cached settings) is cleared the moment the site
  notices a different project.
- No owner, no admin, no products, no orders, no wallet address, no bot.
- The **first account that signs in becomes the owner** of the new store.
- In Telegram, the **first person who opens the bot becomes the bot owner**.
- The original store's owner emails, deposit wallet, bot username, website
  address and Telegram owner IDs do **not** apply to any other project.

## 3. Set everything from Settings

- Store name, tagline, logo, banners, notices, categories, fees, minimum order
- Website address, referral percentage and cap, owner emails
- Deposit wallet address and QR
- SMTP (Spacemail or any provider) for order and delivery emails
- Telegram bot token from BotFather + bot username → press
  **Save & connect Telegram bot**. It verifies the token and registers the
  webhook automatically.
- Telegram owner IDs, bot button colours, premium emojis
- Supplier (reseller) API address and key, Razorpay keys

Products, stock, coupons, users and orders are all managed from the admin panel
on the website and inside the bot (`/admin`).
