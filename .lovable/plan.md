# Dedicated admin product editor

## What will change
- Convert the current `/admin` screen into a proper admin section so dedicated child pages can open reliably.
- Keep the existing admin dashboard at `/admin` with its current Analysis and Management tabs.
- Move product editing out of the long Products list into `/admin/edit/:productId`.
- Change Edit actions for regular and API-delivered products to open that dedicated page.

## Product edit page
- Show the product image, name, visibility, category, description, selling price, delivery method, and supplier details in a clearer full-page form.
- Keep 16:9 image upload/link editing and the current image validation.
- Support manual, repeated, stock-based, and supplier/API delivery settings.
- For stock products, show available and used stock, add stock in bulk, and clear available stock with confirmation.
- For supplier/API products, show supplier cost, stock, provider, markup, and the calculated selling price while preserving imported identifiers.
- Include Save, visibility toggle, announce, and safe delete actions.
- Preserve the existing protection that prevents deleted API products from returning on the next import.
- Return to the Products area after saving or cancelling.

## Products and API shops pages
- Keep product lists compact and focused on search, status, price, stock, and quick actions.
- Remove duplicated inline product-edit controls now handled by the dedicated page.
- Leave provider connection, import, bulk visibility, and provider-wide deletion controls on the API shops screen.

## Technical details
- Promote `/admin` to a parent route that renders its child content, with the current dashboard moved to the `/admin` index route.
- Add a typed dynamic route for `/admin/edit/$productId`; the permanent ID avoids collisions when products share a name or are renamed.
- Reuse Firebase, current admin authorization, product types, image uploader, supplier sync, announcements, and stock history.
- Add unique no-index metadata for the editor page and preserve existing admin metadata.
- Verify the dashboard, both Edit entry points, save flow, and mobile layout.
