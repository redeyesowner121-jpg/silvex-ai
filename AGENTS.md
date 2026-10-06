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
