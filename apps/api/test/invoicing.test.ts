// Runnable check (no DB): node --experimental-strip-types --test test/invoicing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultEstimateExpiresAt, estimateNumber } from "../src/estimates.ts";
import { applyPayment, defaultInvoiceDueAt, invoiceNumber, updateInvoiceStatus } from "../src/invoicing.ts";

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

test("draft invoices can be sent or voided", () => {
  assert.equal(updateInvoiceStatus("draft", "sent"), "sent");
  assert.equal(updateInvoiceStatus("draft", "void"), "void");
});

test("terminal invoice states cannot be reopened", () => {
  assert.throws(() => updateInvoiceStatus("paid", "sent"));
  assert.throws(() => updateInvoiceStatus("void", "sent"));
  assert.equal(updateInvoiceStatus("void", "void"), "void");
});

test("invoice numbers are sequential and zero-padded", () => {
  assert.equal(invoiceNumber(0), "INV-1000");
  assert.equal(invoiceNumber(42), "INV-1042");
  assert.equal(invoiceNumber(2, "MARC", 5000), "MARC-5002");
});

test("default invoice due date follows configured net days", () => {
  assert.equal(defaultInvoiceDueAt(14, new Date("2026-07-15T12:00:00.000Z")).toISOString(), "2026-07-29T12:00:00.000Z");
});

test("estimate numbers and expiration follow configured settings", () => {
  assert.equal(estimateNumber(2, "MARC-EST", 700), "MARC-EST-0702");
  assert.equal(defaultEstimateExpiresAt(0, new Date("2026-01-01T00:00:00.000Z")), null);
  assert.equal(defaultEstimateExpiresAt(30, new Date("2026-01-01T00:00:00.000Z"))?.toISOString(), "2026-01-31T00:00:00.000Z");
});
