# Eight dedicated admin management pages

## What will change
- Replace the Management tab strip with a full-page grid of eight clear management buttons.
- Give each option its own address and page: Requests, Products, API shops, Coupons, Users, Bot buttons, Hosting, and Settings.
- Keep Analysis at `/admin`, including the dashboard and orders view.
- Add a consistent admin page header with Back to Management navigation on every management page.

## Page behavior
- Reuse every existing management tool and its current Firebase data and actions; only navigation and page organization change.
- Preserve the dedicated product editor and return edited products to the Products page.
- Keep admin-only access checks on every page.
- Make the eight-button Management overview and all page headers work cleanly on mobile.

## Technical details
- Add one typed TanStack route for each management destination under `/admin`.
- Extract shared authorization, management navigation, and data-backed request/coupon views so the pages do not duplicate logic.
- Replace old `?tab=` product links and redirects with typed links to the new pages.
- Add unique no-index metadata to every admin page and verify every button, back link, and product-edit return flow.
