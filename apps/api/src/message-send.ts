// Real send workflow. Every outbound customer email is recorded as a
// message_logs row: recipient, rendered subject/body snapshot, delivery
// attempts, timestamps, and the SMTP result. Failed deliveries can be retried
// from history. Everything is org-scoped. SMTP is injected so the pure pieces
// are unit-testable; the database wiring is exercised by live smoke tests.
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  messageLogs,
  invoices,
  estimates,
  estimateOptions,
  jobs,
  customers,
  orgs,
  payments,
} from "@ofp/db";
import { formatMoney, mergeBusinessSettings } from "@ofp/shared";
import {
  renderEstimateMessage,
  renderInvoiceMessage,
  type TemplateVariables,
} from "./message-templates.js";
import { sendEmail, type EmailAttachment, type SendResult } from "./mailer.js";

export const MESSAGE_KINDS = ["invoice", "estimate"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const MESSAGE_STATUSES = ["pending", "sent", "failed"] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export interface DeliveryOutcome {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Pure: computes the next stored state after one delivery attempt. Kept apart
 * from the database so the status/attempt/timestamp transitions are unit
 * tested without a live database.
 */
export function applyDeliveryOutcome(
  current: { status: MessageStatus; attempts: number },
  outcome: DeliveryOutcome,
  now: Date = new Date(),
): {
  status: MessageStatus;
  attempts: number;
  messageId: string | null;
  error: string | null;
  sentAt: Date | null;
  lastAttemptAt: Date;
} {
  return {
    status: outcome.ok ? "sent" : "failed",
    attempts: current.attempts + 1,
    messageId: outcome.ok ? (outcome.messageId ?? null) : null,
    error: outcome.ok ? null : (outcome.error ?? "delivery failed"),
    sentAt: outcome.ok ? now : null,
    lastAttemptAt: now,
  };
}

export function canRetryMessage(status: string): boolean {
  return status === "failed";
}

export interface MessageLogDTO {
  id: string;
  kind: MessageKind;
  documentId: string;
  customerId: string;
  recipient: string;
  subject: string;
  body: string;
  status: MessageStatus;
  attempts: number;
  messageId: string | null;
  error: string | null;
  sentAt: string | null;
  lastAttemptAt: string | null;
  createdAt: string;
}

export function messageLogView(row: typeof messageLogs.$inferSelect): MessageLogDTO {
  return {
    id: row.id,
    kind: row.kind as MessageKind,
    documentId: row.documentId,
    customerId: row.customerId,
    recipient: row.recipient,
    subject: row.subject,
    body: row.body,
    status: row.status as MessageStatus,
    attempts: row.attempts,
    messageId: row.messageId,
    error: row.error,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    lastAttemptAt: row.lastAttemptAt ? row.lastAttemptAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface MessageDelivery {
  orgId: string;
  kind: MessageKind;
  documentId: string;
  customerId: string;
  recipient: string;
  subject: string;
  body: string;
  /** Optional durable document attached to the email. */
  attachments?: EmailAttachment[];
  /** Injected for tests; defaults to the real SMTP mailer. */
  deliver?: () => Promise<SendResult | null>;
}

async function attemptDelivery(
  log: typeof messageLogs.$inferSelect,
  delivery: MessageDelivery,
): Promise<MessageLogDTO> {
  let outcome: DeliveryOutcome;
  try {
    const result = await (delivery.deliver ??
      (() => sendEmail({ to: delivery.recipient, subject: delivery.subject, text: delivery.body, attachments: delivery.attachments })))();
    outcome = result
      ? { ok: true, messageId: result.messageId }
      : { ok: false, error: "email is not configured" };
  } catch (error) {
    outcome = { ok: false, error: error instanceof Error ? error.message : "delivery failed" };
  }
  const next = applyDeliveryOutcome(
    { status: log.status as MessageStatus, attempts: log.attempts },
    outcome,
  );
  const [updated] = await db
    .update(messageLogs)
    .set({ ...next, updatedAt: new Date() })
    .where(and(eq(messageLogs.orgId, delivery.orgId), eq(messageLogs.id, log.id)))
    .returning();
  return messageLogView(updated);
}

/** Records a new message and delivers it. Returns the final log row. */
export async function deliverMessage(delivery: MessageDelivery): Promise<MessageLogDTO> {
  const [log] = await db
    .insert(messageLogs)
    .values({
      orgId: delivery.orgId,
      kind: delivery.kind,
      documentId: delivery.documentId,
      customerId: delivery.customerId,
      recipient: delivery.recipient,
      subject: delivery.subject,
      body: delivery.body,
    })
    .returning();
  return attemptDelivery(log, delivery);
}

/** Retries a failed delivery on the same recipient/subject/body snapshot. */
export type AttachmentResolver = (log: typeof messageLogs.$inferSelect) => Promise<EmailAttachment[] | undefined>;

/** Retries a failed delivery, re-attaching the durable document when present. */
export async function retryMessage(
  orgId: string,
  messageId: string,
  resolveAttachment?: AttachmentResolver,
): Promise<MessageLogDTO | { statusCode: number; error: string }> {
  const [log] = await db
    .select()
    .from(messageLogs)
    .where(and(eq(messageLogs.orgId, orgId), eq(messageLogs.id, messageId)));
  if (!log) return { statusCode: 404, error: "message not found" };
  if (!canRetryMessage(log.status)) {
    return { statusCode: 409, error: "only failed messages can be retried" };
  }
  return attemptDelivery(log, {
    orgId,
    kind: log.kind as MessageKind,
    documentId: log.documentId,
    customerId: log.customerId,
    recipient: log.recipient,
    subject: log.subject,
    body: log.body,
    // The stored document is re-attached on retry so the customer always
    // receives the same durable PDF.
    attachments: resolveAttachment ? await resolveAttachment(log) : undefined,
  });
}

export function listMessages(
  orgId: string,
  filter: { kind?: MessageKind; documentId?: string },
) {
  const clauses = [eq(messageLogs.orgId, orgId)];
  if (filter.kind) clauses.push(eq(messageLogs.kind, filter.kind));
  if (filter.documentId) clauses.push(eq(messageLogs.documentId, filter.documentId));
  return db
    .select()
    .from(messageLogs)
    .where(and(...clauses))
    .orderBy(desc(messageLogs.createdAt));
}

// ── Document email drafts ──

export type EmailDraft =
  | {
      ok: true;
      customerId: string;
      recipient: string;
      recipientName: string;
      subject: string;
      body: string;
      variables: TemplateVariables;
    }
  | { ok: false; statusCode: number; error: string };

async function customerForJob(orgId: string, jobId: string) {
  const [job] = await db.select().from(jobs).where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
  if (!job) return null;
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.orgId, orgId), eq(customers.id, job.customerId)));
  return customer ?? null;
}

/** Renders the invoice email draft from the org's message template settings. */
export async function buildInvoiceEmail(orgId: string, invoiceId: string): Promise<EmailDraft> {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)));
  if (!invoice) return { ok: false, statusCode: 404, error: "invoice not found" };

  const customer = await customerForJob(orgId, invoice.jobId);
  if (!customer) return { ok: false, statusCode: 404, error: "job customer not found" };
  if (!customer.email) {
    return { ok: false, statusCode: 409, error: `customer ${customer.name} has no email address on file` };
  }

  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  const settings = mergeBusinessSettings(org?.businessSettings);
  const paidRows = await db
    .select({ amount: payments.amount })
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.invoiceId, invoiceId)));
  const paid = paidRows.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = Math.max(0, invoice.total - paid);

  const rendered = renderInvoiceMessage(settings.messages, {
    companyName: org?.name ?? "",
    customerName: customer.name,
    invoiceNumber: invoice.number,
    totalCents: invoice.total,
    balanceCents: balance,
    dueDate: invoice.dueAt,
    formattedMoney: formatMoney,
  });
  return {
    ok: true,
    customerId: customer.id,
    recipient: customer.email,
    recipientName: customer.name,
    subject: rendered.subject,
    body: rendered.body,
    variables: rendered.variables,
  };
}

/** Renders the estimate email draft from the org's message template settings. */
export async function buildEstimateEmail(orgId: string, estimateId: string): Promise<EmailDraft> {
  const [estimate] = await db
    .select()
    .from(estimates)
    .where(and(eq(estimates.orgId, orgId), eq(estimates.id, estimateId)));
  if (!estimate) return { ok: false, statusCode: 404, error: "estimate not found" };

  const customer = await customerForJob(orgId, estimate.jobId);
  if (!customer) return { ok: false, statusCode: 404, error: "job customer not found" };
  if (!customer.email) {
    return { ok: false, statusCode: 409, error: `customer ${customer.name} has no email address on file` };
  }

  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId));
  const settings = mergeBusinessSettings(org?.businessSettings);

  // Options are ordered by position; labels power the email copy.
  const optionLabels = await listEstimateOptionLabels(orgId, estimateId);

  const rendered = renderEstimateMessage(settings.messages, {
    companyName: org?.name ?? "",
    customerName: customer.name,
    estimateNumber: estimate.number,
    totalCents: estimate.total,
    optionCount: optionLabels.length,
    optionLabels,
    expiresAt: estimate.expiresAt,
    formattedMoney: formatMoney,
  });
  return {
    ok: true,
    customerId: customer.id,
    recipient: customer.email,
    recipientName: customer.name,
    subject: rendered.subject,
    body: rendered.body,
    variables: rendered.variables,
  };
}

async function listEstimateOptionLabels(orgId: string, estimateId: string): Promise<string[]> {
  const options = await db
    .select({ label: estimateOptions.label, position: estimateOptions.position })
    .from(estimateOptions)
    .where(and(eq(estimateOptions.orgId, orgId), eq(estimateOptions.estimateId, estimateId)))
    .orderBy(asc(estimateOptions.position));
  return options.map((option) => option.label);
}
