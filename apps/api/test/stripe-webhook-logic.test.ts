import { test } from "node:test";
import assert from "node:assert/strict";
import { checkoutSessionPaymentCommand, paymentIdFromCheckoutSession, validateCheckoutSessionCommand } from "../src/stripe-webhook-logic.ts";

test("paymentIdFromCheckoutSession prefers payment_intent string", () => {
  assert.equal(paymentIdFromCheckoutSession({ id: "cs_123", payment_intent: "pi_123" }), "pi_123");
});

test("paymentIdFromCheckoutSession accepts expanded payment_intent object", () => {
  assert.equal(paymentIdFromCheckoutSession({ id: "cs_123", payment_intent: { id: "pi_456" } }), "pi_456");
});

test("paymentIdFromCheckoutSession falls back to checkout session id", () => {
  assert.equal(paymentIdFromCheckoutSession({ id: "cs_123" }), "cs_123");
});

test("checkoutSessionPaymentCommand maps Stripe checkout metadata to payment command", () => {
  const command = checkoutSessionPaymentCommand("evt_123", {
    id: "cs_123",
    payment_intent: "pi_123",
    amount_total: 24500,
    metadata: { invoiceId: "inv-id", orgId: "org-id" },
  });
  assert.deepEqual(command, {
    invoiceId: "inv-id",
    orgId: "org-id",
    amount: 24500,
    method: "card",
    reference: "cs_123",
    provider: "stripe",
    providerPaymentId: "pi_123",
    idempotencyKey: "evt_123",
  });
});

test("validateCheckoutSessionCommand rejects missing invoice metadata", () => {
  const command = checkoutSessionPaymentCommand("evt_123", { id: "cs_123", payment_intent: "pi_123", amount_total: 100, metadata: { orgId: "org-id" } });
  assert.equal(validateCheckoutSessionCommand(command), "missing invoiceId metadata");
});

test("validateCheckoutSessionCommand rejects missing amount", () => {
  const command = checkoutSessionPaymentCommand("evt_123", { id: "cs_123", payment_intent: "pi_123", metadata: { invoiceId: "inv-id", orgId: "org-id" } });
  assert.equal(validateCheckoutSessionCommand(command), "missing amount_total");
});
