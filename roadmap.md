# Reseller API documentation downloads

- [x] Website reseller API page offers a downloadable documentation file containing the signed-in user's key.
- [x] Telegram API search/command sends the documentation file and provides a reusable download button.

# Roadmap

## Admin pages (done)
- [x] Keep the admin dashboard at `/admin` under a proper admin layout
- [x] Add a complete dedicated product editor at `/admin/edit/:productId`
- [x] Link regular and API products to the dedicated editor
- [x] Verify admin navigation, editing, and mobile layout
- [x] Show all eight Management options as full-page buttons
- [x] Give every Management option its own admin page
- [x] Verify all Management pages and mobile navigation

## Premium emoji system (ported)
Phase 1 — core
- [x] Remove the old "replace this emoji everywhere" logic
- [x] Slot store in Firebase (`telegramEmoji/slots`, `/products`, `/enabled`) with a cached loader
- [x] `e()` / `be()` / `productEmoji()` with emoji-id validation (`/^[1-9]\d{14,19}$/`)
- [x] HTML → `{ text, entities }` converter wired into every send (`src/lib/telegram-entities.ts`)
- [x] `/setemoji` capture: extract entity → verify with `getCustomEmojiStickers` → save canonical fallback
- [x] Premium entities applied consistently to messages, uploaded-photo captions, and document captions
- [x] Fresh emoji settings fetched from one Firebase snapshot before each bot response; legacy records normalized on load

Phase 2 — UX
- [x] Paginated picker: button / normal / website places and products
- [x] Capture state + cancel, reset one place, reset everything
- [x] On/off switch for premium emojis (strips markup when off)
- [ ] Admin web toggle for the same switch

Phase 3 — website parity
- [x] Slot + product artwork read live from `telegramEmoji/slotimg` and `/prodimg`
- [x] `Emo` / `EmojiArt` render artwork with a plain-emoji fallback
- [ ] Animated `.tgs` playback on the website (currently uses the still thumbnail)

Phase 4 — polish
- [x] Apply saved premium IDs to supported Telegram inline-button icons with safe plain fallback
- [x] Keep uploaded-photo delivery working when Telegram rejects premium button icons
- [x] Escape customer review text before premium emoji conversion
- [ ] Digit / letter character slots
- [ ] Receipts and PDFs strip markup server-side
- [x] Broadcasts and flash-sale messages through the same pipeline

## Waiting on you
- [ ] Redeploy on Railway so the live bot uses the new emoji system
- [ ] DNS records for silvex-ai.com at Spaceship
- [ ] Turn on Business Mode for the bot in BotFather
