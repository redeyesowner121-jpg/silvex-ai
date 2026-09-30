import { useEffect, useState } from "react";

const KEY = "noticesRead";
const EVT = "notices-read-change";

function load(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

/** Ids of notifications this device has marked as read. */
export function useReadNotices() {
  const [read, setRead] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setRead(load());
    sync();
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return new Set(read);
}

export function markNoticesRead(ids: string[]) {
  const next = Array.from(new Set([...load(), ...ids])).slice(-500);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVT));
}
