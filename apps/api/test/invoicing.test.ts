// Runnable check (no DB): node --experimental-strip-types --test test/invoicing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPayment, invoiceNumber, isDuplicatePayment, paymentIdentity } from "../src/invoicing.ts";

test("full payment marks the invoice paid", () => {
  const r = applyPayment(18900, 0, 18900, "sent");
  assert.equal(r.status, "paid");
  assert.equal(r.remaining, 0);
  assert.equal(r.overpaid, 0);
});

test("partial payment keeps it sent with a remaining balance", () => {
  const r = applyPayment(18900, 0, 10000, "sent");
  assert.equal(r.status, "sent");
  assert.equal(r.remaining, 8900);
});

test("a second payment that clears the balance flips it to paid", () => {
  const r = applyPayment(18900, 10000, 8900, "sent");
  assert.equal(r.status, "paid");
  assert.equal(r.remaining, 0);
});

test("overpayment is tracked, not lost", () => {
  const r = applyPayment(18900, 0, 20000, "sent");
  assert.equal(r.status, "paid");
  assert.equal(r.overpaid, 1100);
});

test("paying a void invoice throws", () => {
  assert.throws(() => applyPayment(100, 0, 100, "void"));
});

test("non-positive payment is rejected", () => {
  assert.throws(() => applyPayment(100, 0, 0, "sent"));
});

test("payment identity uses explicit idempotency first", () => {
  assert.deepEqual(paymentIdentity({ amount: 100, method: "card", provider: "stripe", providerPaymentId: "pi_123", idempotencyKey: "evt_123" }), {
    provider: "stripe",
    providerPaymentId: "pi_123",
    idempotencyKey: "evt_123",
  });
});

test("payment identity falls back to provider and reference", () => {
  assert.deepEqual(paymentIdentity({ amount: 100, method: "check", reference: "check-55" }), {
    provider: "check",
    providerPaymentId: "check-55",
    idempotencyKey: "check:check-55",
  });
});

test("duplicate payment is detected by idempotency key", () => {
  assert.equal(isDuplicatePayment(
    { amount: 100, method: "card", provider: "stripe", providerPaymentId: "pi_123", idempotencyKey: "evt_123" },
    [{ provider: "stripe", providerPaymentId: "pi_other", idempotencyKey: "evt_123" }],
  ), true);
});

test("duplicate payment is detected by provider payment id", () => {
  assert.equal(isDuplicatePayment(
    { amount: 100, method: "card", provider: "stripe", providerPaymentId: "pi_123" },
    [{ provider: "stripe", providerPaymentId: "pi_123", idempotencyKey: null }],
  ), true);
});

test("different provider payment id is not a duplicate", () => {
  assert.equal(isDuplicatePayment(
    { amount: 100, method: "card", provider: "stripe", providerPaymentId: "pi_123" },
    [{ provider: "stripe", providerPaymentId: "pi_999", idempotencyKey: null }],
  ), false);
});

test("invoice numbers are sequential and zero-padded", () => {
  assert.equal(invoiceNumber(0), "INV-1000");
  assert.equal(invoiceNumber(42), "INV-1042");
});
