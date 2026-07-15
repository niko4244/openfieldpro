import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "@ofp/shared";
import type { OrgSettingsDTO } from "./api";
import { invoiceDocumentHtml } from "./document-data";

function orgWith(settings: Partial<BusinessSettings>): OrgSettingsDTO {
  return {
    id: "org-1",
    name: "Marco's Appliance Repair Company",
    timezone: "America/Chicago",
    brandColor: "#2563EB",
    removeOpenFieldProAttribution: false,
    businessSettings: {
      ...DEFAULT_BUSINESS_SETTINGS,
      ...settings,
      invoice: {
        ...DEFAULT_BUSINESS_SETTINGS.invoice,
        ...(settings.invoice ?? {}),
        visibility: {
          ...DEFAULT_BUSINESS_SETTINGS.invoice.visibility,
          ...(settings.invoice?.visibility ?? {}),
        },
      },
    },
  };
}

test("invoice document uses configured message and hides customer info when disabled", () => {
  const html = invoiceDocumentHtml({
    invoice: { number: "MARC-1001", status: "sent", total: 18900, payments: [] },
    customer: { name: "Private Customer", email: "private@example.test", phone: "555-0100" },
    job: { title: "Refrigerator repair", description: "Customer-facing job note." },
    lineItems: [{ description: "Diagnostic", quantity: 1, unitPrice: 18900 }],
    org: orgWith({
      invoice: {
        ...DEFAULT_BUSINESS_SETTINGS.invoice,
        defaultMessage: "Configured invoice message.",
        paymentInstructions: "Configured payment instructions.",
        visibility: {
          ...DEFAULT_BUSINESS_SETTINGS.invoice.visibility,
          showCustomerInfo: false,
          showLineItemPrices: false,
        },
      },
    }),
  });

  assert.match(html, /Configured invoice message/);
  assert.match(html, /Configured payment instructions/);
  assert.match(html, /\$189\.00/);
  assert.match(html, />—<\/td>/);
  assert.doesNotMatch(html, /Private Customer/);
  assert.doesNotMatch(html, /private@example\.test/);
});
