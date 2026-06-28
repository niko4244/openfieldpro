// Pure invoice/payment state logic — testable without a DB or Stripe.
import type { InvoiceStatus } from "@ofp/shared";

export interface PaymentApplication {
  paidSoFar: number; // cents, after applying this payment
  status: InvoiceStatus;
  remaining: number; // cents still owed (never negative)
  overpaid: number; // cents paid beyond the total (for refunds/credit)
}

export interface PaymentCommand {
  amount: number;
  method: string;
  reference?: string | null;
  provider?: string | null;
  providerPaymentId?: string | null;
  idempotencyKey?: string | null;
}

export interface ExistingPaymentIdentity {
  provider?: string | null;
  providerPaymentId?: string | null;
  idempotencyKey?: string | null;
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

export function paymentIdentity(command: PaymentCommand) {
  const provider = command.provider?.trim() || command.method || "manual";
  const providerPaymentId = command.providerPaymentId?.trim() || command.reference?.trim() || null;
  const idempotencyKey = command.idempotencyKey?.trim() || (providerPaymentId ? `${provider}:${providerPaymentId}` : null);
  return { provider, providerPaymentId, idempotencyKey };
}

export function isDuplicatePayment(command: PaymentCommand, existing: ExistingPaymentIdentity[]) {
  const identity = paymentIdentity(command);
  return existing.some((row) => {
    if (identity.idempotencyKey && row.idempotencyKey === identity.idempotencyKey) return true;
    if (identity.providerPaymentId && row.provider === identity.provider && row.providerPaymentId === identity.providerPaymentId) return true;
    return false;
  });
}

/** Human invoice number from a per-org sequence. */
export function invoiceNumber(seq: number): string {
  return `INV-${String(1000 + seq).padStart(4, "0")}`;
}
