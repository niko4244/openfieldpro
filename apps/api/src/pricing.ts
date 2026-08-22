// Settings-aware pricing: resolves the org's tax profile and saved discount
// into a durable PricingSnapshot for estimates and invoices. Pure (no DB) so
// it is unit-testable without a database.
import type { BusinessSettings, PricingSnapshot, SavedDiscount, TaxProfile } from "@ofp/shared";
import { applyPricing } from "./totals.js";

export interface ResolvedTax {
  rateBps: number;
  profileId: string | null;
  label: string;
}

/**
 * Resolve the tax rate for a document. Explicitly selected profiles win; a
 * null profileId falls back to the org's default profile, then to the legacy
 * single-rate setting. Taxes disabled means no tax regardless of profiles.
 */
export function resolveTaxRate(settings: BusinessSettings, profileId?: string | null): ResolvedTax {
  if (!settings.taxes.taxEnabled) {
    return { rateBps: 0, profileId: null, label: settings.taxes.taxLabel };
  }
  const profiles: TaxProfile[] = settings.taxes.taxProfiles ?? [];
  if (profiles.length > 0) {
    const selected = profileId ? profiles.find((profile) => profile.id === profileId) : undefined;
    const profile = selected ?? profiles.find((p) => p.isDefault) ?? profiles[0];
    return { rateBps: profile.rateBps, profileId: profile.id, label: profile.name || settings.taxes.taxLabel };
  }
  return { rateBps: settings.taxes.defaultTaxRateBps ?? 0, profileId: null, label: settings.taxes.taxLabel };
}

/** Resolve a saved discount by id. Discounts disabled means no discount. */
export function resolveDiscount(settings: BusinessSettings, discountId?: string | null): SavedDiscount | null {
  if (!settings.taxes.discountsEnabled || !discountId) return null;
  return settings.taxes.discounts?.find((discount) => discount.id === discountId) ?? null;
}

/**
 * Build the durable pricing snapshot for a document: line subtotal, the saved
 * discount (by id), and the org tax profile (by id or default). The snapshot
 * keeps the applied labels and rates so later settings changes never rewrite
 * issued numbers.
 */
export function buildPricingSnapshot(
  settings: BusinessSettings,
  subtotal: number,
  options?: { taxProfileId?: string | null; discountId?: string | null },
): PricingSnapshot {
  const tax = resolveTaxRate(settings, options?.taxProfileId);
  const discount = resolveDiscount(settings, options?.discountId);
  const applied = applyPricing(subtotal, tax.rateBps, discount ?? undefined);
  return {
    subtotal: applied.subtotal,
    discount: applied.discountCents,
    tax: applied.taxCents,
    total: applied.total,
    taxRateBps: tax.rateBps,
    taxProfileId: tax.profileId,
    taxLabel: tax.label,
    discountId: discount?.id ?? null,
    discountLabel: discount?.name ?? "",
    discountType: discount?.type ?? null,
  };
}
