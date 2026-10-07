import { isOriginProject } from "./origin";

/**
 * Permanent owners of the original store. They always keep full admin access,
 * can never be removed, and nobody can grant admin to others.
 * Ignored on any remixed database.
 */
export const PERMANENT_OWNER_EMAILS = [
  "red.eyes.owner121@gmail.com",
  "mohiuddinarif78@gmail.com",
];

/** Former admins whose access is permanently removed, even if old data says otherwise. */
export const REVOKED_ADMIN_EMAILS = [
  "mohiuddinarif0278@gmail.com",
  "mohiuddinarif8299@gmail.com",
];

const norm = (e?: string | null) => String(e ?? "").trim().toLowerCase();

export function isPermanentOwner(email?: string | null): boolean {
  if (!isOriginProject()) return false;
  return PERMANENT_OWNER_EMAILS.includes(norm(email));
}

export function isRevokedAdmin(email?: string | null): boolean {
  if (!isOriginProject()) return false;
  return REVOKED_ADMIN_EMAILS.includes(norm(email));
}
