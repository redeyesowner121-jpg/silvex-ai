import { isOriginProject } from "./origin";

/**
 * Permanent owners of the original store. They always keep full admin access,
 * can never be removed, and are the only ones who may grant admin to others.
 * Ignored on any remixed database.
 */
export const PERMANENT_OWNER_EMAILS = [
  "red.eyes.owner121@gmail.com",
  "mohiuddinarif0278@gmail.com",
  "mohiuddinarif8299@gmail.com",
];

export function isPermanentOwner(email?: string | null): boolean {
  if (!isOriginProject()) return false;
  return PERMANENT_OWNER_EMAILS.includes(String(email ?? "").trim().toLowerCase());
}
