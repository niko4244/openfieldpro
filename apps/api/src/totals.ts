// Pure money math, shared by job/estimate/invoice totals. Cents in, cents out.
// Kept dependency-free so it's unit-testable without a database.
export interface LineLike {
  quantity: number;
  unitPrice: number; // cents (revenue side)
  unitCost?: number; // cents (cost side; optional so old callers unaffected)
}

export function lineTotal(l: LineLike): number {
  return Math.round(l.quantity * l.unitPrice);
}

export function sumLines(lines: LineLike[]): number {
  return lines.reduce((acc, l) => acc + lineTotal(l), 0);
}

// Sum of business-side cost across line items. Missing unitCost treated as 0:
// old data and old callers stay correct without backfill.
export function sumCosts(lines: LineLike[]): number {
  return lines.reduce(
    (acc, l) => acc + Math.round(l.quantity * (l.unitCost ?? 0)),
    0,
  );
}

// Total cost on a job = sum of line-item costs + the job-level labor cost.
// laborCostCents is jobs.laborCostCents (tech time for the whole job).
export function jobCost(lines: LineLike[], laborCostCents: number): number {
  return sumCosts(lines) + laborCostCents;
}

// Margin = revenue - cost. Positive is profit, negative is loss. Sign-preserving:
// downstream code never needs to clamp to zero (which would hide losses).
export function jobMargin(total: number, cost: number): number {
  return total - cost;
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Discounts and taxes ────────────────────────────────────────────────────
// Pure money math only: settings-aware resolution lives in pricing.ts so this
// module stays dependency-free and unit-testable.

export type DiscountKind = "fixed" | "percent";

export interface SavedDiscountLike {
  id?: string;
  name?: string;
  type: DiscountKind;
  /** Fixed discounts: cents. Percent discounts: basis points (0–10000). */
  value: number;
}

export interface PricingTotals {
  subtotal: number;
  discountCents: number;
  taxableCents: number;
  taxCents: number;
  total: number;
}

/**
 * Discount amount for a subtotal. Fixed discounts are absolute cents clamped
 * to the subtotal; percent discounts are basis points clamped to 0–10000 and
 * rounded to whole cents. A missing discount yields zero.
 */
export function discountAmount(subtotal: number, discount: SavedDiscountLike | null | undefined): number {
  if (!discount) return 0;
  const safeSubtotal = Math.max(0, Math.round(subtotal));
  if (discount.type === "fixed") {
    return Math.min(safeSubtotal, Math.max(0, Math.round(discount.value)));
  }
  const percent = Math.max(0, Math.min(10_000, Math.round(discount.value)));
  return Math.round((safeSubtotal * percent) / 10_000);
}

/**
 * Apply a discount (first) and a tax rate (on the discounted amount) to a
 * subtotal. Discounts never produce a negative taxable base and tax rates are
 * clamped at zero, so the total can never go below zero.
 */
export function applyPricing(
  subtotal: number,
  taxRateBps: number,
  discount?: SavedDiscountLike | null,
): PricingTotals {
  const safeSubtotal = Math.max(0, Math.round(subtotal));
  const discountCents = discountAmount(safeSubtotal, discount);
  const taxableCents = safeSubtotal - discountCents;
  const rate = Math.max(0, Math.round(taxRateBps));
  const taxCents = Math.round((taxableCents * rate) / 10_000);
  return { subtotal: safeSubtotal, discountCents, taxableCents, taxCents, total: taxableCents + taxCents };
}
