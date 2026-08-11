// Runnable check (no DB): node --import tsx --test test/message-send.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_BUSINESS_SETTINGS } from "@ofp/shared";
import {
  applyDeliveryOutcome,
  canRetryMessage,
} from "../src/message-send.js";
import {
  renderEstimateMessage,
  renderInvoiceMessage,
} from "../src/message-templates.js";

const messages = DEFAULT_BUSINESS_SETTINGS.messages;
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const NOW = new Date("2026-08-11T12:00:00Z");

test("invoice email renders number, total, balance, and due date", () => {
  const rendered = renderInvoiceMessage(messages, {
    companyName: "Marco's Appliance Repair",
    customerName: "Jordan Lee",
    invoiceNumber: "INV-1005",
    totalCents: 52200,
    balanceCents: 44300,
    dueDate: new Date("2026-09-01T00:00:00Z"),
    formattedMoney: money,
  });
  assert.equal(rendered.subject, "Invoice INV-1005 from Marco's Appliance Repair");
  assert.match(rendered.body, /Hi Jordan Lee/);
  assert.match(rendered.body, /Balance due: \$443\.00/);
  assert.equal(rendered.variables.invoiceNumber, "INV-1005");
});

test("invoice email without a due date renders no date text", () => {
  const rendered = renderInvoiceMessage(messages, {
    companyName: "ACME",
    customerName: "Sam",
    invoiceNumber: "INV-1",
    totalCents: 1000,
    balanceCents: 1000,
    dueDate: null,
    formattedMoney: money,
  });
  assert.equal(rendered.variables.dueDate, null);
  // No formatted due-date text leaks into the rendered copy.
  assert.doesNotMatch(rendered.body, /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b \d{1,2}, \d{4}/);
});

test("estimate email renders number, total, option labels, and expiry section", () => {
  const rendered = renderEstimateMessage(messages, {
    companyName: "Marco's Appliance Repair",
    customerName: "Jordan Lee",
    estimateNumber: "EST-1005",
    totalCents: 20000,
    optionCount: 3,
    optionLabels: ["Good", "Better", "Best"],
    expiresAt: new Date("2026-09-01T00:00:00Z"),
    formattedMoney: money,
  });
  assert.equal(rendered.subject, "Estimate from Marco's Appliance Repair");
  assert.equal(rendered.variables.estimateTotal, "$200.00");
  assert.equal(rendered.variables.optionLabels, "Good, Better, Best");
  assert.equal(rendered.variables.optionCount, 3);
});

test("estimate email hides the expiry section when there is no expiry", () => {
  const rendered = renderEstimateMessage(messages, {
    companyName: "ACME",
    customerName: "Sam",
    estimateNumber: "EST-2",
    totalCents: 5000,
    optionCount: 0,
    optionLabels: [],
    expiresAt: null,
    formattedMoney: money,
  });
  assert.equal(rendered.variables.expiresAt, null);
  assert.doesNotMatch(rendered.body, /\d{4}/);
});

test("delivery outcome marks a successful attempt as sent with message id and timestamps", () => {
  const next = applyDeliveryOutcome({ status: "pending", attempts: 0 }, { ok: true, messageId: "smtp-123" }, NOW);
  assert.equal(next.status, "sent");
  assert.equal(next.attempts, 1);
  assert.equal(next.messageId, "smtp-123");
  assert.equal(next.error, null);
  assert.equal(next.sentAt, NOW);
  assert.equal(next.lastAttemptAt, NOW);
});

test("delivery outcome records a failed attempt with error and no sent timestamp", () => {
  const next = applyDeliveryOutcome({ status: "pending", attempts: 0 }, { ok: false, error: "Greeting never received" }, NOW);
  assert.equal(next.status, "failed");
  assert.equal(next.attempts, 1);
  assert.equal(next.messageId, null);
  assert.equal(next.sentAt, null);
  assert.equal(next.error, "Greeting never received");
  assert.equal(next.lastAttemptAt, NOW);
});

test("a retry keeps counting attempts and can flip a failure to success", () => {
  const failed = applyDeliveryOutcome({ status: "pending", attempts: 0 }, { ok: false, error: "timeout" }, NOW);
  const retried = applyDeliveryOutcome(
    { status: failed.status, attempts: failed.attempts },
    { ok: true, messageId: "smtp-456" },
    new Date("2026-08-11T12:05:00Z"),
  );
  assert.equal(retried.status, "sent");
  assert.equal(retried.attempts, 2);
  assert.equal(retried.messageId, "smtp-456");
  assert.equal(retried.error, null);
  assert.ok(retried.sentAt! > NOW);
});

test("only failed messages can be retried", () => {
  assert.equal(canRetryMessage("failed"), true);
  assert.equal(canRetryMessage("sent"), false);
  assert.equal(canRetryMessage("pending"), false);
});
