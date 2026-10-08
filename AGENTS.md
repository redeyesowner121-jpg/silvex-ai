<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Telegram browsing screens use the short-lived in-memory catalogue cache; final purchases always re-read product and user data for correctness and safety.
- Telegram channel membership is checked only on `/start`; non-members may skip the prompt and continue using the bot.
- Supplier refreshes triggered by Telegram are single-flight and locally limited to once per minute to prevent interaction traffic from creating overlapping sync work.
Pandora Digital provider added to PROVIDERS (id 'pandora', string product ids, Idempotency-Key header, available_balance).
- Telegram button presentation settings live under `site_settings/button_colors`, `button_names`, and `product_buttons`; emoji metadata stays under `telegramEmoji` so premium IDs are preserved.
- Bot purchases deduct wallet and claim auto-stock via ETag transactions (`dbTransact`), refund automatically when automatic delivery fails, and split bulk deliveries into multiple messages plus a .txt file — prevents duplicate accounts, lost money and Telegram's 4096-char limit.
- Supplier orders send both `qty` and `quantity` — shops disagree on the field name and silently default to 1.
- Supplier stock changes (back in stock, +5 or more with a 3h per-product cooldown, new imports) are announced via a background queue, combined into one digest when several change; Railway also runs a 2-minute supplier check timer.
- Broadcasts run one at a time (`runBroadcast` lane), are tagged `_broadcast` so `tg()` can pause them on 429s, and shrink free-mode waves while customers use the bot — keeps live replies responsive.
- Website wallet changes (checkout, cancel refunds, crypto deposits, signup referral) run server-side in src/lib/wallet.server.ts after verifying the Firebase ID token; Firebase rules forbid customers writing wallet/history/referral fields — prevents self-credited balances.
