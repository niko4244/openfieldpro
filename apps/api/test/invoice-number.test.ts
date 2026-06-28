import { test } from "node:test";
import assert from "node:assert/strict";
import { formatInvoiceNumber, nextInvoiceSequence, normalizeInvoicePrefix } from "../src/invoice-number.ts";

test("normalizeInvoicePrefix uppercases and removes unsafe characters", () => {
  assert.equal(normalizeInvoicePrefix(" inv "), "INV");
  assert.equal(normalizeInvoicePrefix("ar-2026!"), "AR-2026");
  assert.equal(normalizeInvoicePrefix("***"), "INV");
});

test("formatInvoiceNumber uses a positive sequence and four digit padding", () => {
  assert.equal(formatInvoiceNumber("inv", 1), "INV-0001");
  assert.equal(formatInvoiceNumber("AR", 42), "AR-0042");
  assert.equal(formatInvoiceNumber("AR", 10000), "AR-10000");
});

test("formatInvoiceNumber rejects invalid sequences", () => {
  assert.throws(() => formatInvoiceNumber("INV", 0));
  assert.throws(() => formatInvoiceNumber("INV", -1));
  assert.throws(() => formatInvoiceNumber("INV", 1.5));
});

test("nextInvoiceSequence advances count safely", () => {
  assert.equal(nextInvoiceSequence(0), 1);
  assert.equal(nextInvoiceSequence(41), 42);
  assert.throws(() => nextInvoiceSequence(-1));
  assert.throws(() => nextInvoiceSequence(1.2));
});
