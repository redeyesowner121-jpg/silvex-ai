import { useEffect, useState } from "react";
import { get, ref, set } from "firebase/database";
import { useStore } from "@/context/StoreContext";
import { sendSmtpMail } from "@/lib/mail.functions";
import { emailShell } from "@/lib/mailer";
import { input } from "@/components/admin/shared";

export function SmtpAdmin({ siteName }: { siteName: string }) {
  const { db, notify } = useStore();
  const [s, setS] = useState({
    enabled: false,
    host: "mail.spacemail.com",
    port: "465",
    secure: true,
    username: "",
    password: "",
    fromEmail: "",
    fromName: siteName,
  });
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!db) return;
    get(ref(db, "site_settings/smtp")).then((snap) => {
      const v = snap.val();
      if (v)
        setS((prev) => ({
          ...prev,
          ...v,
          port: String(v.port ?? 465),
          secure: Boolean(v.secure ?? true),
          enabled: Boolean(v.enabled),
        }));
    });
  }, [db]);

  async function save() {
    if (!db) return;
    await set(ref(db, "site_settings/smtp"), {
      enabled: s.enabled,
      host: s.host.trim(),
      port: Number(s.port || 465),
      secure: s.secure,
      username: s.username.trim(),
      password: s.password,
      fromEmail: s.fromEmail.trim(),
      fromName: s.fromName,
    });
    notify("Email settings saved");
  }

  async function sendTest() {
    const to = testTo.trim();
    if (!to) return notify("Enter an address to test");
    setBusy(true);
    try {
      const res = await sendSmtpMail({
        data: {
          smtp: {
            host: s.host.trim(),
            port: Number(s.port || 465),
            secure: s.secure,
            username: s.username.trim(),
            password: s.password,
            fromEmail: s.fromEmail.trim(),
            fromName: s.fromName,
          },
          to,
          subject: `Test email from ${siteName}`,
          html: emailShell(siteName, "It works!", "<p>Your mail settings are working.</p>"),
        },
      });
      notify(res.ok ? "Test email sent" : `Failed: ${res.error}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-black">Email (Spacemail / SMTP)</h2>
      <label className="flex items-center gap-2 text-xs font-bold">
        <input
          type="checkbox"
          checked={s.enabled}
          onChange={(e) => setS({ ...s, enabled: e.target.checked })}
        />
        Send emails to customers
      </label>
      <input
        className={input}
        placeholder="SMTP host (mail.spacemail.com)"
        value={s.host}
        onChange={(e) => setS({ ...s, host: e.target.value })}
      />
      <div className="flex gap-2">
        <input
          className={input}
          placeholder="Port (465)"
          value={s.port}
          onChange={(e) => setS({ ...s, port: e.target.value })}
        />
        <label className="flex shrink-0 items-center gap-2 text-xs font-bold">
          <input
            type="checkbox"
            checked={s.secure}
            onChange={(e) => setS({ ...s, secure: e.target.checked })}
          />
          SSL
        </label>
      </div>
      <input
        className={input}
        placeholder="Mailbox / username"
        value={s.username}
        onChange={(e) => setS({ ...s, username: e.target.value })}
      />
      <input
        className={input}
        type="password"
        placeholder="Mailbox password"
        value={s.password}
        onChange={(e) => setS({ ...s, password: e.target.value })}
      />
      <input
        className={input}
        placeholder="From address (no-reply@yourdomain.com)"
        value={s.fromEmail}
        onChange={(e) => setS({ ...s, fromEmail: e.target.value })}
      />
      <input
        className={input}
        placeholder="From name"
        value={s.fromName}
        onChange={(e) => setS({ ...s, fromName: e.target.value })}
      />
      <button onClick={save} className="btn-grad w-full rounded-xl py-2.5 text-sm font-bold">
        Save email settings
      </button>
      <div className="flex gap-2 pt-1">
        <input
          className={input}
          placeholder="Send test email to..."
          value={testTo}
          onChange={(e) => setTestTo(e.target.value)}
        />
        <button
          disabled={busy}
          onClick={sendTest}
          className="shrink-0 rounded-xl border border-border px-3 text-xs font-bold disabled:opacity-50"
        >
          {busy ? "Sending..." : "Test"}
        </button>
      </div>
    </div>
  );
}

