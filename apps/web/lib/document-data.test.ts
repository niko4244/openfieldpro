import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "@ofp/shared";
import type { OrgSettingsDTO } from "./api";
import { estimateDocumentHtml, invoiceDocumentHtml } from "./document-data";

function orgWith(settings: Partial<BusinessSettings>): OrgSettingsDTO {
  return {
    id: "org-1",
    name: "Marco's Appliance Repair Company",
    timezone: "America/Chicago",
    logoUrl: "https://cdn.example.test/marcos-logo.png",
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
  assert.match(html, /<img class="logo"[^>]+marcos-logo\.png[^>]+Marco&#039;s Appliance Repair Company logo/);
  assert.match(html, /Configured payment instructions/);
  assert.match(html, /\$189\.00/);
  assert.match(html, />Hidden<\/td>/);
  assert.doesNotMatch(html, /Private Customer/);
  assert.doesNotMatch(html, /private@example\.test/);
});

test("estimate document renders Good, Better, Best and marks the approved option", () => {
  const options = [
    { id: "good", label: "Good", lineItems: [{ description: "Repair", quantity: 1, unitPrice: 20_000 }] },
    { id: "better", label: "Better", lineItems: [{ description: "Repair plus maintenance", quantity: 1, unitPrice: 30_000 }] },
    { id: "best", label: "Best", lineItems: [{ description: "Replacement", quantity: 1, unitPrice: 80_000 }] },
  ];
  const html = estimateDocumentHtml({
    estimate: { id: "estimate-1", number: "EST-1001", total: 30_000, accepted: true, status: "approved", selectedOptionId: "better", options },
    customer: { name: "Customer" },
    job: { title: "Cooling repair" },
    lineItems: options[0].lineItems,
    org: orgWith({}),
  });

  assert.match(html, /Good/);
  assert.match(html, /<h2>Better<\/h2><span>Approved<\/span>/);
  assert.match(html, /Best/);
  assert.match(html, /\$300\.00/);
});
