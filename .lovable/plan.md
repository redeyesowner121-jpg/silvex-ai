# Fix premium emoji application

## Changes
- Make each bot request wait for the latest premium-emoji settings before composing messages.
- Route photo captions and all direct Telegram messages through the same premium-emoji entity conversion used by normal messages.
- Normalize old saved emoji entries so a legacy fallback cannot apply the wrong symbol.
- Replace missing slot references that currently display a dot.

## Verification
- Check message and photo-caption payloads contain the correct custom emoji IDs and UTF-16 entity offsets.
- Confirm repeated or conflicting fallback characters never apply the wrong premium emoji.
- Run the focused TypeScript check and update the roadmap status.

## Telegram limitation
Premium emojis will apply in message text and captions. Telegram button labels will continue using normal emoji characters because Telegram does not support custom emoji entities inside buttons.
