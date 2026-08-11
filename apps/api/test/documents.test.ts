// Runnable check (no DB): node --import tsx --test test/documents.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { FieldDocumentData } from "@ofp/shared";
import {
  documentFilename,
  documentSha256,
  renderFieldDocumentPdf,
} from "../src/documents.js";

function sampleInvoiceData(): FieldDocumentData {
  return {
    kind: "invoice",
    number: "MARCO-INV-1007",
    status: "sent",
    issuedAt: "Aug 10, 2026",
    dueAt: "Aug 24, 2026",
    customerName: "Jordan Lee",
    customerEmail: "jordan.lee@example.test",
    customerPhone: "(555) 010-8821",
    jobTitle: "Compressor replacement",
    notes: "Thank you for your business.",
    lineItems: [
      { description: "Compressor replacement", quantity: 1, unitPriceCents: 50000 },
      { description: "Refrigerant recharge", quantity: 2, unitPriceCents: 1100 },
    ],
    paymentsCents: 0,
    branding: {
      companyName: "Marco's Appliance Repair Company",
      brandColor: "#22C55E",
      footerText: "Field service command center document",
      publicEmail: "office@marco.test",
      publicPhone: "(555) 000-1234",
    },
    presentation: { showLineItemPrices: true, showPayments: true, showBalance: true },
  };
}

test("renders a valid, non-empty PDF for an invoice", async () => {
  const buffer = await renderFieldDocumentPdf(sampleInvoiceData());
  assert.ok(buffer.length > 1000, `pdf too small: ${buffer.length}`);
  assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(buffer.subarray(buffer.length - 6).toString("latin1").includes("%%EOF"));
});

test("renders a PDF for an estimate with options", async () => {
  const data: FieldDocumentData = {
    kind: "estimate",
    number: "MARCO-EST-1005",
    status: "approved",
    issuedAt: "Aug 10, 2026",
    customerName: "Jordan Lee",
    jobTitle: "Compressor replacement",
    lineItems: [],
    options: [
      {
        id: "opt-1",
        label: "Good",
        selected: true,
        lineItems: [{ description: "Compressor replacement", quantity: 1, unitPriceCents: 20000 }],
      },
      {
        id: "opt-2",
        label: "Better",
        selected: false,
        lineItems: [{ description: "Compressor + labor", quantity: 1, unitPriceCents: 30000 }],
      },
    ],
    paymentsCents: 0,
    branding: { companyName: "Marco's Appliance Repair Company", brandColor: "#22C55E" },
    presentation: { showLineItemPrices: true },
  };
  const buffer = await renderFieldDocumentPdf(data);
  assert.ok(buffer.subarray(0, 5).toString("latin1") === "%PDF-");
  assert.ok(buffer.length > 1000);
});

test("PDF generation is deterministic for identical input", async () => {
  const first = await renderFieldDocumentPdf(sampleInvoiceData());
  const second = await renderFieldDocumentPdf(sampleInvoiceData());
  assert.equal(documentSha256(first), documentSha256(second));
});

test("documentSha256 returns a hex sha-256 digest", () => {
  const digest = documentSha256(Buffer.from("hello"));
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(digest, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});

test("documentFilename sanitizes and keeps the document number", () => {
  assert.equal(documentFilename("Invoice", "MARCO-INV-1007"), "Invoice MARCO-INV-1007.pdf");
  assert.equal(documentFilename("Estimate", "EST/1000"), "Estimate EST-1000.pdf");
});
