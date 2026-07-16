import { expect, test, type Page, type Route } from "@playwright/test";

const estimate = {
  id: "11111111-1111-4111-8111-111111111111",
  orgId: "org-1",
  jobId: "job-1",
  number: "EST-1001",
  total: 20_000,
  accepted: false,
  status: "draft",
  selectedOptionId: null,
  createdAt: "2026-07-16T12:00:00.000Z",
  lineItems: [],
  options: ["Good", "Better", "Best"].map((label, position) => ({
    id: `option-${position + 1}`,
    estimateId: "11111111-1111-4111-8111-111111111111",
    label,
    position,
    total: 20_000 + position * 10_000,
    lineItems: [{ id: `line-${position + 1}`, optionId: `option-${position + 1}`, description: `${label} repair`, quantity: 1, unitPrice: 20_000 + position * 10_000, unitCost: 0, createdAt: "2026-07-16T12:00:00.000Z" }],
  })),
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockEstimate(page: Page) {
  await page.route("http://127.0.0.1:3001/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === `/api/estimates/${estimate.id}` && request.method() === "GET") return json(route, estimate);
    if (path === `/api/estimates/${estimate.id}/send` && request.method() === "POST") {
      estimate.status = "sent";
      return json(route, estimate);
    }
    if (path.includes("/lines") && request.method() === "POST") return json(route, { lineItem: {}, total: 25_000 }, 201);
    if (path === "/api/notifications/unread-count") return json(route, { count: 0 });
    if (path === "/api/notifications") return json(route, []);
    return json(route, {});
  });
}

test("dispatcher reviews Good, Better, Best and marks the estimate sent", async ({ page }) => {
  await mockEstimate(page);
  await page.goto(`/estimates/${estimate.id}`);
  await expect(page.getByRole("tab", { name: /Good/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Better/ })).toBeVisible();
  await page.getByRole("tab", { name: /Best/ }).click();
  await expect(page.getByText("Best repair")).toBeVisible();
  await page.getByRole("button", { name: "Mark sent" }).click();
  await expect(page.getByText(/sent · 3 options/)).toBeVisible();
});

test("estimate option editor has no horizontal overflow on mobile", async ({ page }) => {
  await mockEstimate(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/estimates/${estimate.id}`);
  await expect(page.getByRole("tab", { name: /Good/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
