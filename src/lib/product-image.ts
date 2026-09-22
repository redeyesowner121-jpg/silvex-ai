/**
 * Product photos uploaded as base64 data URIs live inside the product record.
 * Rendering them straight from the record would inline megabytes into the
 * page, so data-URI logos are served through a small cached image endpoint
 * instead. External URLs pass through unchanged.
 */
export function productImageSrc(id: string | undefined, logo: string | undefined): string {
  if (!logo) return "";
  if (logo.startsWith("data:") && id) return `/api/public/product-img/${id}`;
  return logo;
}
