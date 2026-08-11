// Runnable check (no DB): node --experimental-strip-types --test test/deposits.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { depositAmountFor, depositSummary } from "../src/estimates.ts";

test("depositAmountFor returns zero when deposit mode is none", () => {
  assert.equal(depositAmountFor(50_000, "none", 1_000), 0);
  assert.equal(depositAmountFor(50_000, "none", 0), 0);
});

test("depositAmountFor treats non-positive values as no deposit", () => {
  assert.equal(depositAmountFor(50_000, "fixed", 0), 0);
  assert.equal(depositAmountFor(50_000, "percent", -10), 0);
  assert.equal(depositAmountFor(50_000, "fixed", -500), 0);
});

test("depositAmountFor fixed mode returns the configured cents", () => {
  assert.equal(depositAmountFor(50_000, "fixed", 15_000), 15_000);
  assert.equal(depositAmountFor(1_200, "fixed", 2_500), 2_500);
});

test("depositAmountFor percent mode is a percentage of the approved option total", () => {
  assert.equal(depositAmountFor(50_000, "percent", 25), 12_500);
  assert.equal(depositAmountFor(10_000, "percent", 10), 1_000);
});

test("depositAmountFor percent mode rounds to whole cents", () => {
  assert.equal(depositAmountFor(33_333, "percent", 25), 8_333);
  assert.equal(depositAmountFor(1_999, "percent", 33), 660);
});

test("depositSummary reports remaining and completion", () => {
  const partial = depositSummary(12_500, 5_000);
  assert.equal(partial.requiredCents, 12_500);
  assert.equal(partial.collectedCents, 5_000);
  assert.equal(partial.remainingCents, 7_500);
  assert.equal(partial.collected, false);

  const complete = depositSummary(12_500, 12_500);
  assert.equal(complete.remainingCents, 0);
  assert.equal(complete.collected, true);
});

test("depositSummary clamps collected and remaining to the required amount", () => {
  const overpaid = depositSummary(12_500, 20_000);
  assert.equal(overpaid.collectedCents, 12_500);
  assert.equal(overpaid.remainingCents, 0);
  assert.equal(overpaid.collected, true);

  const none = depositSummary(0, 0);
  assert.equal(none.collected, false);
  assert.equal(none.remainingCents, 0);
});
