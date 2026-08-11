import type { DepositMode } from "@ofp/shared";

export function estimateNumber(seq: number, prefix = "EST", nextNumber = 1000): string {
  return `${prefix}-${String(nextNumber + seq).padStart(4, "0")}`;
}

export function defaultEstimateExpiresAt(days: number, now = new Date()): Date | null {
  if (days <= 0) return null;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Deposit required for an approved estimate option. `fixed` is an integer
 * amount in cents; `percent` is a percentage of the approved option total.
 * A `none` mode or a non-positive value means no deposit.
 */
export function depositAmountFor(optionTotal: number, mode: DepositMode, value: number): number {
  if (mode === "none" || !Number.isFinite(value) || value <= 0) return 0;
  if (mode === "fixed") return Math.round(value);
  if (mode === "percent") return Math.round((optionTotal * value) / 100);
  return 0;
}

export interface DepositSummary {
  requiredCents: number;
  collectedCents: number;
  remainingCents: number;
  collected: boolean;
}

/** Collected deposit can never exceed the required amount. */
export function depositSummary(requiredCents: number, collectedCents: number): DepositSummary {
  const required = Math.max(0, requiredCents);
  const collected = Math.min(required, Math.max(0, collectedCents));
  return {
    requiredCents: required,
    collectedCents: collected,
    remainingCents: required - collected,
    collected: required > 0 && collected >= required,
  };
}
