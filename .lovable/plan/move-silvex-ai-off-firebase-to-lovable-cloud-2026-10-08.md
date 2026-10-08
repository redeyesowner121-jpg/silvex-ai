# Move Silvex Ai off Firebase to Lovable Cloud

Lovable Cloud holds all data and customer logins. Railway keeps running the website and the Telegram bot. Firebase is switched off at the end.

Scope today: 54 files use Firebase (28 in the website, about 300 database calls in the bot and server), plus about 20 MB of data (669 customers, orders, products, stock, settings, bot users).

## What customers will notice
- Same website, same bot, same balances, orders and history.
- The first time each website customer logs in, they tap **Forgot password**, get an email link and set a new password. Firebase won't hand over passwords, so this is required.
- Telegram-only customers notice nothing.
- About 10–20 minutes of downtime during the final switch, while the last data is copied.

## Phases (each one is checked before the next starts)

1. **Turn on Lovable Cloud** and create the data structure: customers, wallet history, orders, products, stock (private), settings (secrets kept server-side only), coupons, reviews, notifications, deposits and payment claims, bot users and bot state, API keys, push subscriptions, broadcast and support records. Roles go in a separate roles table, and owners are set from the permanent-owner list.
2. **Database access layer.** One server module replaces the bot's Firebase helpers (`dbGet`, `dbPut`, `dbPatch`, `dbPush`, `dbTransact`). Money and stock changes become safe database transactions, so there are no double charges or double deliveries.
3. **Bot and server code** (deposits, Razorpay, Binance, crypto, supplier sync, broadcasts, reseller API, push, statements) switched to the new layer.
4. **Website**: logins switch to Lovable Cloud email and password (sign-up, login, forgot password, change password, change email). Live updates for wallet, notices and admin lists come from Lovable Cloud. Every admin page is switched over.
5. **Copy all data** with a one-time copy script, checked by counting customers, matching total wallet money, and comparing order counts. Each customer is matched to their new login by email; Telegram users are matched by chat ID.
6. **Switch over**: a final copy, then Railway gets the new settings and the bot webhook is re-pointed and tested with a real /start and a test purchase.
7. **Remove Firebase**: delete the Firebase code and settings, update REMIX.md and project memory. You can then delete the Firebase project yourself.

## Things to know
- This is the biggest change the store has had. It takes several working sessions, not one message.
- While I build it, the live store keeps running on Firebase. Nothing changes for customers until phase 6.
- The exposed keys from earlier (bot token, Razorpay, supplier, email password) should still be changed. The new setup stores them as private server settings.

## Technical details
- Tables use proper columns for money (numeric) and stock items in a private table that only server code can read. RLS: customers can read and update only their own safe profile fields; admin is checked through `has_role`. Server code uses an authenticated or admin client, and the admin client is used only after a verified webhook or bot request.
- Server functions use `requireSupabaseAuth`, and the bearer token is attached through the generated attacher in `src/start.ts`.
- Transactions use Postgres functions (`purchase_auto_stock`, `wallet_adjust`, `claim_payment`) with row locks, replacing the ETag `dbTransact`.
- The website's realtime listeners map to realtime subscriptions on wallet history, alerts, notifications and admin tables.
- The migration script reads the Firebase JSON export using the database secret, creates auth users through the admin API (with a random password, then a reset email), and keeps a mapping from old Firebase UIDs to new user IDs.
