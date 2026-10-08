import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Silvex Ai" },
      { name: "description", content: "Choose a new password for your Silvex Ai account." },
      { property: "og:title", content: "Set a new password — Silvex Ai" },
      { property: "og:description", content: "Choose a new password for your Silvex Ai account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (pass.length < 6) return setMsg("Password must be at least 6 characters.");
    if (pass !== pass2) return setMsg("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pass });
    setBusy(false);
    if (error) return setMsg(error.message || "Link expired — request a new reset email.");
    setMsg("Password saved. You're logged in.");
    setTimeout(() => navigate({ to: "/" }), 1200);
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 px-4 py-12">
      <h1 className="text-2xl font-bold text-foreground">Set a new password</h1>
      <input
        type="password"
        placeholder="New password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground"
      />
      <input
        type="password"
        placeholder="Repeat new password"
        value={pass2}
        onChange={(e) => setPass2(e.target.value)}
        className="w-full rounded-xl border border-border bg-card px-4 py-3 text-foreground"
      />
      <button
        onClick={save}
        disabled={busy}
        className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save password"}
      </button>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
