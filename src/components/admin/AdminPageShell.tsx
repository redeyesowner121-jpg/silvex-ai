import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

export function AdminPageShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="fade-in mx-auto max-w-4xl space-y-5">
      <Link to="/admin" search={{ view: "management" }} className="inline-flex items-center gap-2 text-sm font-bold text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Management
      </Link>
      <header>
        <h1 className="font-display text-2xl font-black">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </header>
      {children}
    </div>
  );
}