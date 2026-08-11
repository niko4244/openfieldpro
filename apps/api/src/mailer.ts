// Outbound SMTP mailer. Configured entirely through environment variables so
// no credentials ever live in the repository. When SMTP is not configured the
// mailer fails closed: sendEmail resolves null instead of attempting a send.
import nodemailer, { type Transporter } from "nodemailer";

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  attachments?: EmailAttachment[];
}

export interface SendResult {
  messageId: string;
  accepted: string[];
}

export function resolveSmtpConfig(env: NodeJS.ProcessEnv = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!host || !user || pass === undefined || pass === "") return null;
  return {
    host,
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === "true",
    user,
    pass,
    from: env.SMTP_FROM?.trim() || `${user}`,
  };
}

export function createSmtpTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  });
}

/**
 * Sends an email. Returns null when SMTP is not configured (fail closed) or
 * throws when the transport rejects the message. The transport is created from
 * the resolved config unless one is injected (tests inject a fake).
 */
export async function sendEmail(
  message: EmailMessage,
  injected?: { transport?: Transporter; config?: SmtpConfig | null },
): Promise<SendResult | null> {
  const config = injected?.config === undefined ? resolveSmtpConfig() : injected.config;
  if (!config) return null;
  const transport = injected?.transport ?? createSmtpTransport(config);
  const info = await transport.sendMail({
    from: config.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    attachments: message.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: attachment.content,
      contentType: attachment.contentType,
    })),
  });
  return { messageId: info.messageId ?? "", accepted: info.accepted ?? [] };
}
