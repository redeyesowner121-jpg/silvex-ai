import { createServerFn } from "@tanstack/react-start";

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string;
};

type SendInput = {
  smtp: SmtpSettings;
  to: string;
  subject: string;
  html: string;
  text?: string;
};

function validate(input: SendInput): SendInput {
  const s = input?.smtp;
  if (!s?.host || !s?.username || !s?.password || !s?.fromEmail) {
    throw new Error("Email settings are incomplete.");
  }
  if (!input.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.to)) {
    throw new Error("Invalid recipient address.");
  }
  return {
    smtp: {
      host: String(s.host).trim(),
      port: Number(s.port) || 465,
      secure: Boolean(s.secure),
      username: String(s.username).trim(),
      password: String(s.password),
      fromEmail: String(s.fromEmail).trim(),
      fromName: s.fromName ? String(s.fromName) : undefined,
    },
    to: String(input.to).trim(),
    subject: String(input.subject || "").slice(0, 200),
    html: String(input.html || ""),
    text: input.text ? String(input.text) : undefined,
  };
}

export const sendSmtpMail = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const { WorkerMailer } = await import("worker-mailer");
    const { smtp } = data;
    try {
      const mailer = await WorkerMailer.connect({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        startTls: !smtp.secure,
        credentials: { username: smtp.username, password: smtp.password },
        authType: ["plain", "login"],
      });
      await mailer.send({
        from: smtp.fromName
          ? { name: smtp.fromName, email: smtp.fromEmail }
          : { email: smtp.fromEmail },
        to: { email: data.to },
        subject: data.subject,
        html: data.html,
        text: data.text ?? data.html.replace(/<[^>]+>/g, " "),
      });
      await mailer.close();
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Send failed" };
    }
  });
