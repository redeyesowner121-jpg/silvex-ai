/**
 * Which Firebase project the app is running on.
 *
 * Every built-in default in this app (store owner, deposit wallet, bot owners,
 * website address, bot username) belongs to the ORIGINAL project only. Point
 * the FIREBASE_* secrets at a different project and the whole site starts
 * completely blank: no owner, no wallet address, no bot, no links — everything
 * is then created from scratch inside that new database.
 */
export const ORIGIN_PROJECT_ID = "silvex-ai";

function envProjectId(): string {
  try {
    // Server side: the project comes from the secrets.
    return (typeof process !== "undefined" && process.env?.["FIREBASE_PROJECT_ID"]) || "";
  } catch {
    return "";
  }
}

let activeProjectId = envProjectId() || ORIGIN_PROJECT_ID;

/** Called on the website once the Firebase settings are loaded. */
export function setActiveProjectId(id?: string | null) {
  const next = String(id ?? "").trim();
  if (next) activeProjectId = next;
}

export function activeProjectId_(): string {
  return activeProjectId;
}

/** True only on the original store database. */
export function isOriginProject(): boolean {
  return activeProjectId === ORIGIN_PROJECT_ID;
}
