import { test } from "node:test";
import assert from "node:assert/strict";
import { decoratePortalInvoices, paidByInvoice, portalTotals } from "../src/customer-portal-logic.ts";

test("paidByInvoice aggregates multiple payments against the same invoice", () => {
  const paid = paidByInvoice([
    { invoiceId: "inv-1", amount: 5000 },
    { invoiceId: "inv-1", amount: 2500 },
    { invoiceId: "inv-2", amount: 1000 },
  ]);
  assert.equal(paid.get("inv-1"), 7500);
  assert.equal(paid.get("inv-2"), 1000);
});

test("decoratePortalInvoices calculates balance and paid status", () => {
  const rows = decoratePortalInvoices([
    { id: "inv-1", jobId: "job-1", number: "INV-1001", status: "sent", total: 10000, publicToken: "tok_1" },
    { id: "inv-2", jobId: "job-2", number: "INV-1002", status: "sent", total: 8000, publicToken: null },
  ], [
    { invoiceId: "inv-1", amount: 4000 },
    { invoiceId: "inv-2", amount: 9000 },
  ], "https://app.example.com");

  assert.equal(rows[0].paid, 4000);
  assert.equal(rows[0].balance, 6000);
  assert.equal(rows[0].status, "sent");
  assert.equal(rows[0].publicUrl, "https://app.example.com/public/invoices/tok_1");
  assert.equal(rows[1].paid, 9000);
  assert.equal(rows[1].balance, 0);
  assert.equal(rows[1].status, "paid");
});

test("portalTotals summarizes billing history", () => {
  assert.deepEqual(portalTotals([
    { total: 10000, paid: 4000, balance: 6000 },
    { total: 8000, paid: 8000, balance: 0 },
  ]), {
    totalBilled: 18000,
    totalPaid: 12000,
    totalBalance: 6000,
  });
});
