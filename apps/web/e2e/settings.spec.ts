import { expect, test, type Page, type Route } from "@playwright/test";

const user = { id: "owner-1", name: "Morgan Owner", email: "owner@example.test", role: "owner" };
const org = {
  id: "org-1",
  name: "Marco's Appliance Repair Company",
  timezone: "America/Chicago",
  logoUrl: null,
  brandColor: "#047857",
  documentFooter: null,
  publicEmail: "office@example.test",
  publicPhone: "515-555-0101",
  publicAddress: "100 Service Ave",
  removeOpenFieldProAttribution: false,
  businessSettings: {
    businessHours: { timezone: "America/Chicago", workDays: ["mon", "tue", "wed", "thu", "fri"], startTime: "08:00", endTime: "17:00" },
    serviceAreas: [],
    invoice: { dueTerm: "net_days", netDays: 14, format: "email", defaultMessage: "Thank you.", paymentInstructions: "Pay online.", reminderDays: [3, 7, 14], visibility: { showBusinessInfo: true, showCustomerInfo: true, showJobInfo: true, showLineItems: true, showLineItemPrices: true, showPayments: true, showBalance: true } },
    estimate: { expirationDays: 30, approvalMode: "single_option", signatureRequired: true, depositMode: "none", depositValue: 0, format: "email", defaultMessage: "Please review.", optionLabels: ["Good", "Better", "Best"], visibility: { showBusinessInfo: true, showCustomerInfo: true, showJobInfo: true, showLineItems: true, showLineItemPrices: true, showOptionSummary: true } },
    payments: { onlinePaymentsEnabled: false, allowManualCash: true, allowManualCheck: true, allowManualCard: true, allowPartialPayments: true, tipsEnabled: false },
    taxes: { taxEnabled: false, taxLabel: "Sales tax", defaultTaxRateBps: 0, discountsEnabled: true, defaultDiscountLabel: "Discount" },
    messages: { invoiceEmailSubject: "Invoice", invoiceEmailBody: "Invoice ready.", estimateEmailSubject: "Estimate", estimateEmailBody: "Estimate ready.", reviewRequestBody: "Please review us." },
    numbering: { invoicePrefix: "INV", invoiceNextNumber: 1000, estimatePrefix: "EST", estimateNextNumber: 1000 },
    portal: { enabled: true, showSponsorSlot: true, allowEstimateApproval: true, allowInvoicePayment: true, allowServiceHistory: true },
  },
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockSettingsApi(page: Page, patches: unknown[]) {
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/auth/me") return json(route, user);
    if (path === "/api/notifications/unread-count") return json(route, { count: 0 });
    if (path === "/api/notifications") return json(route, []);
    if (path === "/api/org/logo" && request.method() === "POST") return json(route, { ...org, logoUrl: "http://127.0.0.1:3001/api/public/org-1/logo?v=1" }, 201);
    if (path === "/api/org/logo" && request.method() === "DELETE") return json(route, { ...org, logoUrl: null });
    if (path === "/api/org/me" && request.method() === "PATCH") {
      const patch = request.postDataJSON();
      patches.push(patch);
      return json(route, { ...org, ...patch });
    }
    if (path === "/api/org/me") return json(route, org);
    if (path === "/api/users") return json(route, [user]);
    return json(route, []);
  });
}

test("company operations settings deep-link, validate, save, and fit mobile", async ({ page }) => {
  const patches: unknown[] = [];
  await mockSettingsApi(page, patches);
  await page.context().addCookies([{ name: "ofp_session", value: "session", domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/settings?section=hours");

  await expect(page.getByRole("button", { name: "Business Hours" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Save settings" })).toBeDisabled();
  await page.getByText("Sun", { exact: true }).click();
  await page.getByLabel("Closing time").fill("07:00");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Closing time must be later than opening time.", { exact: true })).toBeVisible();

  await page.getByLabel("Closing time").fill("18:00");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Business settings saved.");
  expect(patches).toHaveLength(1);
  expect((patches[0] as typeof org).businessSettings.businessHours).toMatchObject({ endTime: "18:00", workDays: expect.arrayContaining(["sun"]) });

  await page.getByRole("button", { name: "Service Areas" }).click();
  await page.getByLabel("Service area").fill("50309, 50309, Des Moines");
  await page.getByRole("button", { name: "Add area" }).click();
  await expect(page.getByRole("list", { name: "Configured service areas" }).getByRole("listitem")).toHaveCount(2);
  await expect(page).toHaveURL(/section=areas/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("invoice and estimate settings provide an interactive live customer preview", async ({ page }) => {
  await mockSettingsApi(page, []);
  await page.context().addCookies([{ name: "ofp_session", value: "session", domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/settings?section=invoice");

  const preview = page.getByTestId("document-preview-workbench");
  await expect(preview.getByText("Live preview", { exact: true })).toBeVisible();
  await expect(preview.getByRole("tab", { name: "Invoice" })).toHaveAttribute("aria-selected", "true");

  const invoiceFrame = page.frameLocator('iframe[title="Invoice customer preview"]');
  await expect(invoiceFrame.getByText("Marco's Appliance Repair Company", { exact: true })).toBeVisible();
  await page.getByLabel("Default invoice message").fill("Preview updates immediately.");
  await expect(page.frameLocator('iframe[title="Invoice customer preview"]').locator("body")).toContainText("Preview updates immediately.");

  await preview.getByRole("tab", { name: "Estimate" }).click();
  await expect(preview.getByRole("radio", { name: "Good" })).toHaveAttribute("aria-checked", "true");
  await preview.getByRole("radio", { name: "Better" }).click();
  await expect(preview.getByRole("radio", { name: "Better" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('iframe[title="Estimate customer preview - Better"]')).toBeVisible();

  await preview.getByRole("button", { name: "Phone" }).click();
  await expect(preview.getByRole("button", { name: "Phone" })).toHaveAttribute("aria-pressed", "true");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("company settings upload, preview, and remove a logo", async ({ page }) => {
  await mockSettingsApi(page, []);
  await page.context().addCookies([{ name: "ofp_session", value: "session", domain: "127.0.0.1", path: "/", httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/settings?section=company");

  await page.locator('input[type="file"]').setInputFiles({
    name: "marcos-logo.png",
    mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  });
  await expect(page.getByRole("status")).toHaveText("Company logo uploaded and added to customer documents.");
  await expect(page.getByAltText("Marco's Appliance Repair Company logo preview")).toHaveAttribute("src", /\/api\/public\/org-1\/logo/);

  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(page.getByRole("status")).toHaveText("Company logo removed. Customer documents will use the branded initials.");
  await expect(page.getByRole("button", { name: "Remove logo" })).toHaveCount(0);
});
