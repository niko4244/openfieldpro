// Pure invoice/payment state logic — testable without a DB or Stripe.
import type { InvoiceStatus } from "@ofp/shared";

export interface PaymentApplication {
  paidSoFar: number; // cents, after applying this payment
  status: InvoiceStatus;
  remaining: number; // cents still owed (never negative)
  overpaid: number; // cents paid beyond the total (for refunds/credit)
}

export type PaymentMethod = "manual" | "cash" | "check" | "card";

export interface PaymentRules {
  /** Payment methods the organization accepts, always including `manual`. */
  acceptedMethods: PaymentMethod[];
  /** Whether partial payments are allowed; when false the balance must be settled in full. */
  allowPartial: boolean;
}

/**
 * Derive enforcement rules from the organization's business settings.
 * Toggles are opt-out so a missing setting keeps the permissive default.
 */
export function resolvePaymentRules(settings: {
  payments?: { allowManualCash?: boolean; allowManualCheck?: boolean; allowManualCard?: boolean; allowPartialPayments?: boolean };
}): PaymentRules {
  const payments = settings?.payments ?? {};
  const acceptedMethods: PaymentMethod[] = ["manual"];
  if (payments.allowManualCash !== false) acceptedMethods.push("cash");
  if (payments.allowManualCheck !== false) acceptedMethods.push("check");
  if (payments.allowManualCard !== false) acceptedMethods.push("card");
  return { acceptedMethods, allowPartial: payments.allowPartialPayments !== false };
}

/**
 * Apply a payment to an invoice. An invoice is `paid` once cumulative payments
 * cover the total; otherwise it stays `sent` (partially paid). Voids never flip.
 */
export function applyPayment(
  total: number,
  priorPaid: number,
  amount: number,
  current: InvoiceStatus,
): PaymentApplication {
  if (current === "void") {
    throw new Error("cannot pay a void invoice");
  }
  if (amount <= 0) {
    throw new Error("payment amount must be positive");
  }
  const paidSoFar = priorPaid + amount;
  const remaining = Math.max(0, total - paidSoFar);
  const overpaid = Math.max(0, paidSoFar - total);
  const status: InvoiceStatus = remaining === 0 ? "paid" : "sent";
  return { paidSoFar, status, remaining, overpaid };
}

/**
 * Apply a payment under the organization's payment rules: the method must be
 * accepted, the amount cannot exceed the remaining balance, and when partial
 * payments are disabled the balance must be settled in full.
 */
export function applyPaymentWithRules(
  total: number,
  priorPaid: number,
  amount: number,
  method: PaymentMethod,
  current: InvoiceStatus,
  rules: PaymentRules,
): PaymentApplication {
  if (!rules.acceptedMethods.includes(method)) {
    throw new Error(`payment method ${method} is not accepted for this organization`);
  }
  if (amount <= 0) {
    throw new Error("payment amount must be positive");
  }
  const remaining = Math.max(0, total - priorPaid);
  if (amount > remaining) {
    throw new Error(`payment of $${(amount / 100).toFixed(2)} exceeds the remaining balance of $${(remaining / 100).toFixed(2)}`);
  }
  if (!rules.allowPartial && amount < remaining) {
    throw new Error("partial payments are not allowed for this organization");
  }
  return applyPayment(total, priorPaid, amount, current);
}

export interface InvoiceLineInput {
  quantity: number;
  unitPrice: number;
}

/** Invoice-owned line total in cents — the invoice total is always derived from its own lines. */
export function invoiceLineTotal(lines: InvoiceLineInput[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

/**
 * Total for a newly created invoice. Prefers the snapshotted line sum so the
 * invoice is internally coherent from birth; falls back to the job total only
 * for jobs priced without line items (manual total).
 */
export function invoiceSnapshotTotal(lines: InvoiceLineInput[], fallbackTotal: number): number {
  if (lines.length === 0) return fallbackTotal;
  return invoiceLineTotal(lines);
}

/** Human invoice number from a per-org sequence. */
export function invoiceNumber(seq: number, prefix = "INV", nextNumber = 1000): string {
  return `${prefix}-${String(nextNumber + seq).padStart(4, "0")}`;
}

export function updateInvoiceStatus(
  current: InvoiceStatus,
  requested: "sent" | "void",
): InvoiceStatus {
  if (current === requested) return current;
  if (current === "paid" || current === "void") {
    throw new Error(`cannot mark a ${current} invoice ${requested}`);
  }
  return requested;
}

export function defaultInvoiceDueAt(netDays: number, now = new Date()): Date {
  const due = new Date(now);
  due.setDate(due.getDate() + Math.max(0, Math.floor(netDays)));
  return due;
}
