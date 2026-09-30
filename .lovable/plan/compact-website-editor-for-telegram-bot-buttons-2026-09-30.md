# Compact website editor for Telegram bot buttons

## What will change
- Rebuild Admin → Bot buttons as four compact tabs: Colours, Names, Emojis, and Product buttons.
- Show only the selected tab, with search and bounded lists where needed, so the page no longer requires long scrolling.
- Let admins change shared bot-button colours, display names, and emoji characters from the website.
- Add per-product button controls for the Telegram catalogue: button name, colour, and emoji.

## Behavior
- Save all changes to the existing Firebase settings and apply them to Telegram buttons automatically.
- Preserve existing premium emoji assignments; website emoji edits change the visible fallback emoji without removing saved premium IDs.
- Product changes affect the Telegram button only and do not rename the website product.

## Technical details
- Extend the bot presentation cache and keyboard decorator to load button names and per-product button settings.
- Keep the existing colour defaults and Telegram `/setemoji` flow intact.
- Verify the admin page on mobile and confirm the project builds without errors.
