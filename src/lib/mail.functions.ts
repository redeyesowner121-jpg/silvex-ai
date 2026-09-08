import { createServerFn } from "@tanstack/react-start";

export type SmtpSettings = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string | undefined;
};

export type MailReceipt = {
  orderId: string;
  siteName?: string | undefined;
  total?: number | undefined;
  note?: string | undefined;
  items: { title: string; content: string }[];
};

type SendInput = {
  smtp: SmtpSettings;
  to: string;
  subject: string;
  html: string;
  text?: string | undefined;
  receipt?: MailReceipt | undefined;
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
    receipt: input.receipt?.orderId
      ? {
          orderId: String(input.receipt.orderId),
          siteName: input.receipt.siteName ? String(input.receipt.siteName) : undefined,
          total: Number(input.receipt.total || 0),
          note: input.receipt.note ? String(input.receipt.note) : undefined,
          items: (input.receipt.items || []).map((i) => ({
            title: String(i.title || ""),
            content: String(i.content || ""),
          })),
        }
      : undefined,
  };
}

export const sendSmtpMail = createServerFn({ method: "POST" })
  .inputValidator(validate)
  .handler(async ({ data }) => {
    const { smtp } = data;
    try {
      let WorkerMailer: typeof import("worker-mailer").WorkerMailer;
      try {
        ({ WorkerMailer } = await import("worker-mailer"));
      } catch {
        return {
          ok: false as const,
          error:
            "Email sending is only available on the published site (not in preview).",
        };
      }
      // Build PDF + SVG delivery receipts when the order carries delivery details.
      const attachments: { filename: string; content: string; mimeType: string }[] = [];
      if (data.receipt && data.receipt.items.length) {
        const { buildDeliveryPdf, buildDeliverySvg } = await import("./telegram.server");
        const r = data.receipt;
        const lines = [
          `${r.siteName || "Store"} — delivery receipt`,
          `Order: ${r.orderId}`,
          `Total: $${Number(r.total || 0).toFixed(2)}`,
          `Date: ${new Date().toUTCString()}`,
          "",
          ...r.items.flatMap((i) => [`${i.title}:`, i.content, ""]),
          ...(r.note ? [`Note: ${r.note}`] : []),
        ];
        const b64 = (bytes: Uint8Array) => {
          let bin = "";
          for (const b of bytes) bin += String.fromCharCode(b);
          return btoa(bin);
        };
        attachments.push({
          filename: `delivery-${r.orderId}.pdf`,
          content: b64(buildDeliveryPdf("Delivery receipt", lines)),
          mimeType: "application/pdf",
        });
        attachments.push({
          filename: `delivery-${r.orderId}.svg`,
          content: b64(buildDeliverySvg("Delivery receipt", lines)),
          mimeType: "image/svg+xml",
        });
      }

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
        ...(attachments.length ? { attachments } : {}),
      });
      await mailer.close();
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Send failed" };
    }
  });
