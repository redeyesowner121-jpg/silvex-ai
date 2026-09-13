import { useEffect, useState } from "react";
import { railwayAction, railwayStatus } from "@/lib/railway.functions";
import { Empty } from "@/components/admin/shared";

type Service = {
  serviceId: string;
  name: string;
  environmentId: string;
  environmentName: string;
  status: string;
  updatedAt: string;
  url: string;
};
type Project = { projectId: string; name: string; services: Service[] };

function badge(status: string) {
  const s = status.toUpperCase();
  if (s === "SUCCESS") return "bg-emerald-500/15 text-emerald-600";
  if (s === "FAILED" || s === "CRASHED") return "bg-destructive/15 text-destructive";
  if (s === "BUILDING" || s === "DEPLOYING" || s === "INITIALIZING")
    return "bg-amber-500/15 text-amber-600";
  return "bg-muted text-muted-foreground";
}

export function RailwayAdmin() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [account, setAccount] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const r = await railwayStatus().catch(() => ({ ok: false as const, error: "Network error" }));
    if (r.ok) {
      setAccount((r as any).account || "");
      setProjects(((r as any).projects || []) as Project[]);
    } else setError(r.error || "Could not reach Railway");
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(s: Service, action: "redeploy" | "restart") {
    setBusy(s.serviceId + action);
    setMsg("");
    const r = await railwayAction({
      data: { serviceId: s.serviceId, environmentId: s.environmentId, action },
    }).catch(() => ({ ok: false as const, error: "Network error" }));
    setBusy("");
    setMsg(r.ok ? `${s.name}: ${action === "restart" ? "restarting" : "redeploying"}…` : `${s.name}: ${r.error}`);
    if (r.ok) setTimeout(() => void load(), 4000);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-2xl bg-card p-4 shadow-sm">
        <div>
          <p className="text-sm font-black">Railway hosting</p>
          <p className="text-xs text-muted-foreground">{account || "Connected with your API token"}</p>
        </div>
        <button onClick={() => void load()} className="rounded-lg bg-muted px-3 py-2 text-xs font-bold">
          Refresh
        </button>
      </div>

      {msg ? <p className="rounded-xl bg-muted/60 p-3 text-xs font-bold">{msg}</p> : null}
      {error ? <p className="rounded-xl bg-destructive/10 p-3 text-xs font-bold text-destructive">{error}</p> : null}
      {loading ? <p className="p-4 text-sm text-muted-foreground">Loading…</p> : null}

      {!loading && !error && projects.length === 0 ? <Empty text="No Railway projects found." /> : null}

      {projects.map((p) => (
        <div key={p.projectId} className="rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-black">{p.name}</p>
          {p.services.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">No services in this project.</p>
          ) : null}
          <div className="mt-3 space-y-3">
            {p.services.map((s) => (
              <div key={s.serviceId} className="rounded-xl bg-muted/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {s.environmentName || "—"}
                      {s.updatedAt ? ` · ${new Date(s.updatedAt).toLocaleString()}` : ""}
                    </p>
                  </div>
                  <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${badge(s.status)}`}>
                    {s.status}
                  </span>
                </div>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block break-all text-[11px] font-bold text-primary"
                  >
                    {s.url}
                  </a>
                ) : null}
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={!s.environmentId || busy !== ""}
                    onClick={() => run(s, "redeploy")}
                    className="flex-1 rounded-lg bg-emerald-500 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {busy === s.serviceId + "redeploy" ? "Working…" : "Redeploy"}
                  </button>
                  <button
                    disabled={!s.environmentId || busy !== ""}
                    onClick={() => run(s, "restart")}
                    className="flex-1 rounded-lg bg-card py-2 text-xs font-bold shadow-sm disabled:opacity-60"
                  >
                    {busy === s.serviceId + "restart" ? "Working…" : "Restart"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
