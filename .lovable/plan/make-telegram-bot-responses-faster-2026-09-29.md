# Make Telegram bot responses faster

## Changes
- Stop launching a supplier refresh check after every bot interaction; coalesce background refreshes to one run per minute.
- Warm bot settings, emoji/button presentation, and the product catalogue when the bot server loads so the first customer tap avoids cold database reads.
- Reuse the in-memory product catalogue for product, quantity, and confirmation screens instead of fetching the same product repeatedly.
- Remove the obsolete extra “menu removed” message on `/start`, while keeping the requested inline shop controls.
- Preserve per-chat ordering, payment safety, stock checks, premium emojis, and existing admin behavior.

## Verification
- Run focused type checks and inspect the latest preview build result.
- Confirm common `/start`, product list, product detail, and quantity paths no longer contain the avoidable waits.

## Technical details
- Add an in-process single-flight/time gate around supplier synchronization.
- Add safe background cache warming; failures remain non-blocking and fall back to existing reads.
