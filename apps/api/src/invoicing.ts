// Pure invoice/payment state logic — testable without a DB or Stripe.
import type { InvoiceStatus } from "@ofp/shared";

export interface PaymentApplication {
  paidSoFar: number; // cents, after applying this payment
  status: InvoiceStatus;
  remaining: number; // cents still owed (never negative)
  overpaid: number; // cents paid beyond the total (for refunds/credit)
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
