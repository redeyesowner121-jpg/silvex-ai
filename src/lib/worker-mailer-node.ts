// Node-runtime stand-in for `worker-mailer` (which needs Cloudflare's socket API).
// Used only when the app is built with NITRO_PRESET (e.g. Railway / any Node host).
import nodemailer from "nodemailer";

type Addr = { name?: string; email: string };
type Attachment = { filename: string; content: string; mimeType: string };

type SendOptions = {
  from: Addr;
  to: Addr | Addr[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Attachment[];
};

const fmt = (a: Addr) => (a.name ? `"${a.name}" <${a.email}>` : a.email);

export class WorkerMailer {
  private transport: nodemailer.Transporter;

  private constructor(transport: nodemailer.Transporter) {
    this.transport = transport;
  }

  static async connect(opts: {
    host: string;
    port: number;
    secure?: boolean;
    startTls?: boolean;
    credentials: { username: string; password: string };
    authType?: string[];
  }): Promise<WorkerMailer> {
    const transport = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: !!opts.secure,
      requireTLS: !opts.secure,
      auth: { user: opts.credentials.username, pass: opts.credentials.password },
    });
    await transport.verify();
    return new WorkerMailer(transport);
  }

  async send(msg: SendOptions): Promise<void> {
    const to = Array.isArray(msg.to) ? msg.to.map(fmt).join(", ") : fmt(msg.to);
    await this.transport.sendMail({
      from: fmt(msg.from),
      to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      attachments: (msg.attachments ?? []).map((a) => ({
        filename: a.filename,
        content: a.content,
        encoding: "base64" as const,
        contentType: a.mimeType,
      })),
    });
  }

  async close(): Promise<void> {
    this.transport.close();
  }
}

export default { WorkerMailer };
