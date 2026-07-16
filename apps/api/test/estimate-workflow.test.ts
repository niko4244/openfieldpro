import assert from "node:assert/strict";
import test from "node:test";
import {
  assertEstimateApprovalAllowed,
  estimateOptionTotal,
  nextEstimateLifecycle,
} from "../src/routes/estimates.js";

test("option totals are recomputed from document-owned lines", () => {
  assert.equal(estimateOptionTotal([
    { quantity: 2, unitPrice: 12_500 },
    { quantity: 1, unitPrice: 4_900 },
  ]), 29_900);
});

test("approval rejects expired estimates and missing required signatures", () => {
  assert.throws(() => assertEstimateApprovalAllowed({ status: "sent", expiresAt: new Date("2026-01-01"), signatureRequired: false, signatureName: undefined }, new Date("2026-01-02")), /expired/);
  assert.throws(() => assertEstimateApprovalAllowed({ status: "sent", expiresAt: null, signatureRequired: true, signatureName: "" }), /signature/);
});

test("approval is idempotent only for the option already selected", () => {
  assert.equal(nextEstimateLifecycle("approved", "option-1", "option-1"), "approved");
  assert.throws(() => nextEstimateLifecycle("approved", "option-1", "option-2"), /different option/);
  assert.equal(nextEstimateLifecycle("sent", null, "option-1"), "approved");
});

test("declined and expired estimates cannot be approved", () => {
  assert.throws(() => nextEstimateLifecycle("declined", null, "option-1"), /declined/);
  assert.throws(() => nextEstimateLifecycle("expired", null, "option-1"), /expired/);
  assert.throws(() => nextEstimateLifecycle("draft", null, "option-1"), /sent/);
});
