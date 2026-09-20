# Hosting this store on Railway

The project already contains `railway.json`, so Railway builds and starts it
without extra setup.

- Build: `NITRO_PRESET=node-server bun run build`
- Start: `node .output/server/index.mjs`
- Railway supplies `PORT` automatically.

## 1. Deploy

1. Push this project to GitHub (Lovable → GitHub).
2. Railway → New Project → Deploy from GitHub repo → pick the repo.
3. Wait for the first build, then open Settings → Networking → Generate Domain.

## 2. Variables to add in Railway → Variables

Required:

| Variable | Value |
| --- | --- |
| `FIREBASE_API_KEY` | Firebase web API key |
| `FIREBASE_PROJECT_ID` | e.g. `silvex-ai` |
| `FIREBASE_DATABASE_URL` | e.g. `https://silvex-ai-default-rtdb.firebaseio.com` |
| `FIREBASE_AUTH_DOMAIN` | e.g. `silvex-ai.firebaseapp.com` |
| `FIREBASE_STORAGE_BUCKET` | e.g. `silvex-ai.firebasestorage.app` |
| `FIREBASE_MESSAGING_SENDER_ID` | e.g. `343959828375` |
| `FIREBASE_APP_ID` | e.g. `1:343959828375:web:...` |
| `FIREBASE_MEASUREMENT_ID` | e.g. `G-XXXXXXX` |
| `SITE_URL` | your live address, e.g. `https://silvex-ai.com` |
| `TELEGRAM_BOT_TOKEN` | BotFather token (required outside Lovable) |

Optional, only if used:

| Variable | Purpose |
| --- | --- |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Razorpay deposits |
| `SUPPLIER_API_URL`, `SUPPLIER_API_KEY` | Reseller supplier fallback |
| `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `BINANCE_DEPOSIT_ADDRESS` | Binance deposit checks (admin panel values win) |

## 3. After the domain is live

- Firebase → Authentication → Settings → Authorized domains: add the Railway
  domain and your custom domain.
- Admin panel → Settings: set the website address, then press
  **Save & connect Telegram bot** so the webhook points at the new domain
  (`https://<your-domain>/api/public/telegram/webhook`).
- Razorpay dashboard → Webhooks: `https://<your-domain>/api/public/razorpay/webhook`
  with the same secret as `RAZORPAY_WEBHOOK_SECRET`.
