// Runnable check (no DB needed):  node --import tsx --test test/pricing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "@ofp/shared";
import { buildPricingSnapshot, resolveDiscount, resolveTaxRate } from "../src/pricing.ts";

function settings(overrides: Partial<BusinessSettings["taxes"]> = {}): BusinessSettings {
  return {
    ...DEFAULT_BUSINESS_SETTINGS,
    taxes: {
      ...DEFAULT_BUSINESS_SETTINGS.taxes,
      ...overrides,
    },
  };
}

test("resolveTaxRate honors the default profile when no profile is selected", () => {
  const s = settings({
    taxEnabled: true,
    taxProfiles: [
      { id: "state", name: "State sales tax", rateBps: 650, isDefault: false },
      { id: "county", name: "County tax", rateBps: 150, isDefault: true },
    ],
  });
  const resolved = resolveTaxRate(s);
  assert.equal(resolved.profileId, "county");
  assert.equal(resolved.rateBps, 150);
  assert.equal(resolved.label, "County tax");
});

test("resolveTaxRate prefers an explicitly selected profile", () => {
  const s = settings({
    taxEnabled: true,
    taxProfiles: [
      { id: "state", name: "State sales tax", rateBps: 650, isDefault: true },
      { id: "county", name: "County tax", rateBps: 150, isDefault: false },
    ],
  });
  const resolved = resolveTaxRate(s, "county");
  assert.equal(resolved.profileId, "county");
  assert.equal(resolved.rateBps, 150);
});

test("resolveTaxRate falls back to the legacy single rate without profiles", () => {
  const s = settings({ taxEnabled: true, taxProfiles: [], defaultTaxRateBps: 800 });
  const resolved = resolveTaxRate(s);
  assert.equal(resolved.profileId, null);
  assert.equal(resolved.rateBps, 800);
  assert.equal(resolved.label, "Sales tax");
});

test("resolveTaxRate returns zero when taxes are disabled", () => {
  const s = settings({
    taxEnabled: false,
    taxProfiles: [{ id: "state", name: "State sales tax", rateBps: 650, isDefault: true }],
  });
  const resolved = resolveTaxRate(s);
  assert.equal(resolved.rateBps, 0);
  assert.equal(resolved.profileId, null);
});

test("resolveDiscount returns null when discounts are disabled or the id is missing", () => {
  const s = settings({
    discountsEnabled: false,
    discounts: [{ id: "loyalty", name: "Loyalty 10%", type: "percent", value: 1000 }],
  });
  assert.equal(resolveDiscount(s, "loyalty"), null);
  assert.equal(resolveDiscount(settings({ discountsEnabled: true }), "loyalty"), null);
  assert.equal(resolveDiscount(s, null), null);
});

test("resolveDiscount finds a saved discount by id", () => {
  const s = settings({
    discountsEnabled: true,
    discounts: [
      { id: "loyalty", name: "Loyalty 10%", type: "percent", value: 1000 },
      { id: "friends", name: "Friends & family", type: "fixed", value: 25_000 },
    ],
  });
  assert.deepEqual(resolveDiscount(s, "friends"), { id: "friends", name: "Friends & family", type: "fixed", value: 25_000 });
  assert.equal(resolveDiscount(s, "missing"), null);
});

test("buildPricingSnapshot applies the default tax profile and a saved discount", () => {
  const s = settings({
    taxEnabled: true,
    taxProfiles: [{ id: "state", name: "State sales tax", rateBps: 800, isDefault: true }],
    discountsEnabled: true,
    discounts: [{ id: "loyalty", name: "Loyalty 10%", type: "percent", value: 1000 }],
  });
  const snapshot = buildPricingSnapshot(s, 100_000, { discountId: "loyalty" });
  assert.equal(snapshot.subtotal, 100_000);
  assert.equal(snapshot.discount, 10_000);
  assert.equal(snapshot.tax, 7_200); // 8% on 90,000
  assert.equal(snapshot.total, 97_200);
  assert.equal(snapshot.taxProfileId, "state");
  assert.equal(snapshot.taxLabel, "State sales tax");
  assert.equal(snapshot.discountId, "loyalty");
  assert.equal(snapshot.discountLabel, "Loyalty 10%");
  assert.equal(snapshot.discountType, "percent");
});

test("buildPricingSnapshot with no discount is tax on the full subtotal", () => {
  const s = settings({
    taxEnabled: true,
    taxProfiles: [{ id: "state", name: "State sales tax", rateBps: 650, isDefault: true }],
  });
  const snapshot = buildPricingSnapshot(s, 40_000);
  assert.equal(snapshot.discount, 0);
  assert.equal(snapshot.tax, 2_600);
  assert.equal(snapshot.total, 42_600);
  assert.equal(snapshot.discountId, null);
  assert.equal(snapshot.discountType, null);
});

test("buildPricingSnapshot honors an explicitly selected tax profile", () => {
  const s = settings({
    taxEnabled: true,
    taxProfiles: [
      { id: "state", name: "State sales tax", rateBps: 650, isDefault: true },
      { id: "county", name: "County tax", rateBps: 150, isDefault: false },
    ],
  });
  const snapshot = buildPricingSnapshot(s, 10_000, { taxProfileId: "county" });
  assert.equal(snapshot.taxProfileId, "county");
  assert.equal(snapshot.tax, 150);
});

test("buildPricingSnapshot clamps a fixed discount to the subtotal", () => {
  const s = settings({
    discountsEnabled: true,
    discounts: [{ id: "big", name: "Big coupon", type: "fixed", value: 999_999 }],
  });
  const snapshot = buildPricingSnapshot(s, 5_000, { discountId: "big" });
  assert.equal(snapshot.discount, 5_000);
  assert.equal(snapshot.total, 0);
});
