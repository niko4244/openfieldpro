// Pure report math, shared by the report routes and their unit tests.
// Dependency-free so it runs without a database.
import type {
  ArAgingBucket,
  ArAgingBucketLabel,
  ArAgingReport,
  EstimateConversionReport,
  RevenueTrendPoint,
} from "@ofp/shared";

export const AR_AGING_LABELS: ArAgingBucketLabel[] = ["current", "1-30", "31-60", "61-90", "90+"];

export interface ArInvoiceLike {
  total: number;
  paid: number;
  /** Invoice issue/sent anchor; when null the invoice ages from `createdAt`. */
  dueAt?: Date | string | null;
  createdAt?: Date | string | null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysPastDue(dueAt: Date | null, now: Date): number {
  if (!dueAt) return 0;
  return Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000);
}

function bucketFor(days: number): ArAgingBucketLabel {
  if (days <= 0) return "current";
  if (days <= 30) return "1-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

/** Bucket unpaid invoice balances by days past due (invoices with no balance are excluded). */
export function arAgingReport(invoices: ArInvoiceLike[], now = new Date()): ArAgingReport {
  const buckets = new Map<ArAgingBucketLabel, { count: number; totalCents: number }>(
    AR_AGING_LABELS.map((label) => [label, { count: 0, totalCents: 0 }]),
  );
  let totalOutstandingCents = 0;
  let invoiceCount = 0;

  for (const invoice of invoices) {
    const balance = Math.max(0, Math.round(invoice.total) - Math.round(invoice.paid));
    if (balance <= 0) continue;
    const dueAt = toDate(invoice.dueAt) ?? toDate(invoice.createdAt);
    const bucket = buckets.get(bucketFor(daysPastDue(dueAt, now)))!;
    bucket.count += 1;
    bucket.totalCents += balance;
    totalOutstandingCents += balance;
    invoiceCount += 1;
  }

  return {
    buckets: AR_AGING_LABELS.map((label) => ({ label, ...buckets.get(label)! })),
    totalOutstandingCents,
    invoiceCount,
  };
}

export interface EstimateLike {
  status: string;
  sentAt?: Date | string | null;
  acceptedAt?: Date | string | null;
}

/**
 * Estimate funnel for a window: all estimates that reached the sent stage
 * (sent, approved, declined, expired). Conversion is approved over every
 * estimate that was sent; avgDaysToApprove measures sent → accepted.
 */
export function estimateConversionReport(
  estimates: EstimateLike[],
  windowDays: number,
  now = new Date(),
): EstimateConversionReport {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  const funnel = estimates.filter((estimate) => {
    const sentAt = toDate(estimate.sentAt);
    if (!sentAt) return false;
    if (estimate.status === "draft") return false;
    return sentAt.getTime() >= cutoff;
  });

  const sent = funnel.filter((estimate) => estimate.status === "sent").length;
  const approved = funnel.filter((estimate) => estimate.status === "approved").length;
  const declined = funnel.filter((estimate) => estimate.status === "declined").length;
  const expired = funnel.filter((estimate) => estimate.status === "expired").length;

  const approvalDays: number[] = [];
  for (const estimate of funnel) {
    if (estimate.status !== "approved") continue;
    const sentAt = toDate(estimate.sentAt);
    const acceptedAt = toDate(estimate.acceptedAt);
    if (sentAt && acceptedAt && acceptedAt.getTime() >= sentAt.getTime()) {
      approvalDays.push((acceptedAt.getTime() - sentAt.getTime()) / 86_400_000);
    }
  }

  const denominator = sent + approved + declined + expired;
  return {
    sent,
    approved,
    declined,
    expired,
    conversionRate: denominator > 0 ? approved / denominator : 0,
    avgDaysToApprove: approvalDays.length > 0
      ? Math.round((approvalDays.reduce((sum, days) => sum + days, 0) / approvalDays.length) * 10) / 10
      : null,
    windowDays,
  };
}

export interface PaymentLike {
  paidAt?: Date | string | null;
  amount: number;
}

function monthLabel(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Monthly collected revenue over the trailing N months, zero-filled. */
export function revenueTrendReport(
  payments: PaymentLike[],
  monthsCount: number,
  now = new Date(),
): { months: RevenueTrendPoint[]; totalRevenueCents: number } {
  const safeMonths = Math.max(1, Math.min(60, Math.round(monthsCount)));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (safeMonths - 1), 1));
  const months = new Map<string, number>();
  for (let i = 0; i < safeMonths; i += 1) {
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    months.set(monthLabel(month), 0);
  }

  for (const payment of payments) {
    const paidAt = toDate(payment.paidAt);
    if (!paidAt) continue;
    const label = monthLabel(paidAt);
    if (months.has(label)) {
      months.set(label, months.get(label)! + Math.max(0, Math.round(payment.amount)));
    }
  }

  const series = [...months.entries()].map(([month, revenueCents]) => ({ month, revenueCents }));
  return {
    months: series,
    totalRevenueCents: series.reduce((sum, point) => sum + point.revenueCents, 0),
  };
}

/** On-time when an appointment starts no later than the scheduled start plus grace. */
export function jobOnTime(
  scheduledAt: Date | string | null | undefined,
  appointmentStartsAt: (Date | string | null | undefined)[],
  graceMs = 15 * 60 * 1000,
): boolean | null {
  const scheduled = toDate(scheduledAt);
  if (!scheduled) return null;
  const starts = appointmentStartsAt.map(toDate).filter((date): date is Date => Boolean(date));
  if (starts.length === 0) return null;
  return starts.some((start) => start.getTime() <= scheduled.getTime() + graceMs);
}

/** RFC 4180 CSV serialization with header row from the first record's keys. */
export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown): string => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escape(row[header])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}
