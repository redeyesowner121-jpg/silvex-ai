# RKR Premium Store — rebuild as this app, on Firebase (silvex-ai)

Rebuild the uploaded single-file store as the real app here, using the new Firebase account (silvex-ai) for login, data and analytics. No Supabase, no Lovable Cloud.

## What you'll get

A mobile-style store with a bottom bar (Home, Shop, Cart, Orders, Profile):

- **Home** — scrolling notice, daily bonus claim, promo banner, flash sale card with countdown, search, categories, product grid.
- **Shop** — category filter and search over the product list.
- **Product details** — image, price, description, star reviews, add review, add to cart.
- **Cart & checkout** — quantity, promo code, WhatsApp number and note, pay from wallet, order confirmation screen.
- **Orders** — your orders with status, and cancel with refund back to wallet.
- **Profile / wallet** — balance, phone number, referral code and bonus, transaction history, add-money and withdraw requests.
- **Login** — email/password sign up and sign in, plus Google sign-in.
- **Admin area** — products, orders, money requests, coupons, banner, flash sale, notices and site settings; only visible to admin accounts.
- Toasts, success screens and the same look: Poppins, light grey background, indigo/violet gradient buttons, rounded cards.

## Firebase setup

- Connect to the **silvex-ai** project (auth, realtime database, analytics) using the config you pasted.
- The pasted API key came through as a saved-secret placeholder rather than the real text. Firebase web keys are public by design, so send me the actual `apiKey` string for silvex-ai and I'll put it in the code. Until then login and data won't work.
- The silvex-ai database starts empty, so the store shows nothing at first — I'll add a small set of starter products, categories and settings written from the admin area, or seeded on first admin visit, whichever you prefer.
- Admin access: I'll gate it on a list of admin emails/uids stored in the database (matching how the uploaded file gates it), so nobody else sees it.
- Push notifications (FCM) and EmailJS from the old file are left out of this first build unless you want them.

## Technical notes

- Pages become TanStack Router routes; shared shell (header, bottom nav, modals) in the root layout.
- Firebase modular SDK (`firebase/app`, `auth`, `database`, `analytics`) initialised in one client-only module; analytics guarded so server rendering doesn't break.
- Auth state and cart held in React context; database reads use realtime listeners like the original.
- Styling with Tailwind tokens in `src/styles.css` (Poppins, indigo/violet gradient, grey surface) instead of the CDN Tailwind + inline styles.
- Realtime Database security rules are not editable from here — you'll need to set them in the Firebase console so users can only write their own records.
