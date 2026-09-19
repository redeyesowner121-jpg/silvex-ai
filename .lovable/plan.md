# Add API product file downloads

## Scope
- Add a download-file action for API products in website search results and Telegram bot search results.
- Reuse each product’s existing delivery file or downloadable URL and hide the action when no file exists.
- Keep current purchase, wallet, and supplier delivery behavior unchanged.

## Implementation
- Trace the shared API product data shape and existing delivery-file handling.
- Add the website download control using the existing design system.
- Add a Telegram download button or file response in the bot search flow.
- Validate type safety and both user-facing flows.
