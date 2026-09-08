import type { ReactNode } from "react";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { Modals } from "./Modals";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background pb-24">
      <Header />
      <main className="mx-auto max-w-md px-4 py-5">{children}</main>
      <BottomNav />
      <Modals />
    </div>
  );
}
