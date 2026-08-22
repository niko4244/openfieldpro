// Runnable check (no DB needed):  node --import tsx --test test/totals.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineTotal,
  sumLines,
  sumCosts,
  jobCost,
  jobMargin,
  formatMoney,
  discountAmount,
  applyPricing,
} from "../src/totals.ts";

test("lineTotal multiplies qty * unit price", () => {
  assert.equal(lineTotal({ quantity: 3, unitPrice: 1500 }), 4500);
});

test("sumLines adds every line", () => {
  assert.equal(
    sumLines([
      { quantity: 1, unitPrice: 18900 },
      { quantity: 2, unitPrice: 500 },
    ]),
    19900,
  );
});

test("formatMoney renders cents as dollars", () => {
  assert.equal(formatMoney(18900), "$189.00");
  assert.equal(formatMoney(0), "$0.00");
});

test("sumCosts computes per-line costs and tolerates missing unitCost", () => {
  assert.equal(sumCosts([]), 0);
  assert.equal(sumCosts([{ quantity: 2, unitPrice: 500 }]), 0); // unitCost absent -> 0
  assert.equal(sumCosts([{ quantity: 2, unitPrice: 500, unitCost: 100 }]), 200);
  assert.equal(
    sumCosts([
      { quantity: 1, unitPrice: 1000, unitCost: 50 },
      { quantity: 3, unitPrice: 500, unitCost: 10 },
    ]),
    80,
  );
});

test("jobCost adds sumCosts to the job-level labor cost", () => {
  assert.equal(jobCost([], 0), 0);
  assert.equal(jobCost([{ quantity: 2, unitPrice: 0, unitCost: 100 }], 500), 700);
  assert.equal(
    jobCost(
      [
        { quantity: 1, unitPrice: 1000, unitCost: 50 },
        { quantity: 3, unitPrice: 500, unitCost: 10 },
      ],
      250,
    ),
    330,
  );
});

test("jobMargin preserves sign: positive, zero, and negative (loss)", () => {
  assert.equal(jobMargin(1000, 400), 600); // profit
  assert.equal(jobMargin(500, 500), 0); // break-even
  assert.equal(jobMargin(1000, 1200), -200); // loss — must NOT clamp to 0
});

test("discountAmount returns zero for no discount", () => {
  assert.equal(discountAmount(50_000, null), 0);
  assert.equal(discountAmount(50_000, undefined), 0);
});

test("discountAmount fixed is absolute cents clamped to the subtotal", () => {
  assert.equal(discountAmount(50_000, { type: "fixed", value: 5_000 }), 5_000);
  assert.equal(discountAmount(5_000, { type: "fixed", value: 50_000 }), 5_000);
  assert.equal(discountAmount(50_000, { type: "fixed", value: -100 }), 0);
});

test("discountAmount percent is basis points of the subtotal, rounded", () => {
  assert.equal(discountAmount(50_000, { type: "percent", value: 2_500 }), 12_500);
  assert.equal(discountAmount(33_333, { type: "percent", value: 2_500 }), 8_333);
  assert.equal(discountAmount(10_000, { type: "percent", value: 10_000 }), 10_000);
  assert.equal(discountAmount(10_000, { type: "percent", value: 15_000 }), 10_000);
  assert.equal(discountAmount(10_000, { type: "percent", value: -500 }), 0);
});

test("applyPricing with no tax or discount passes the subtotal through", () => {
  assert.deepEqual(applyPricing(57_500, 0), {
    subtotal: 57_500,
    discountCents: 0,
    taxableCents: 57_500,
    taxCents: 0,
    total: 57_500,
  });
});

test("applyPricing taxes the discounted amount, not the subtotal", () => {
  const result = applyPricing(100_000, 1_000, { type: "fixed", value: 10_000 });
  assert.equal(result.discountCents, 10_000);
  assert.equal(result.taxableCents, 90_000);
  assert.equal(result.taxCents, 9_000); // 9% of 90,000
  assert.equal(result.total, 99_000);
});

test("applyPricing percent discount then tax", () => {
  const result = applyPricing(80_000, 800, { type: "percent", value: 2_500 });
  assert.equal(result.discountCents, 20_000);
  assert.equal(result.taxableCents, 60_000);
  assert.equal(result.taxCents, 4_800); // 8% of 60,000
  assert.equal(result.total, 64_800);
});

test("applyPricing rounds tax to whole cents", () => {
  const result = applyPricing(33_333, 850);
  assert.equal(result.taxCents, 2_833); // 8.5% of 33,333 = 2,833.305 -> 2,833
  assert.equal(result.total, 36_166);
});

test("applyPricing never produces a negative total", () => {
  const result = applyPricing(5_000, 0, { type: "fixed", value: 50_000 });
  assert.equal(result.discountCents, 5_000);
  assert.equal(result.taxableCents, 0);
  assert.equal(result.total, 0);

  const negative = applyPricing(-100, 0);
  assert.equal(negative.subtotal, 0);
  assert.equal(negative.total, 0);
});

test("applyPricing clamps negative tax rates to zero", () => {
  assert.equal(applyPricing(10_000, -500).taxCents, 0);
});
