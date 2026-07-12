import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const artifactDir = path.resolve("artifacts");

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function addRoleCookie(page: Page, role: "owner" | "technician") {
  await page.context().addCookies([
    {
      name: "ofp_session",
      value: role === "technician" ? "technician-session" : "owner-session",
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function resetServerRequests(page: Page) {
  const response = await page.request.post("http://127.0.0.1:3001/__reset");
  expect(response.ok()).toBe(true);
}

async function serverRequestPaths(page: Page) {
  const response = await page.request.get("http://127.0.0.1:3001/__requests");
  expect(response.ok()).toBe(true);
  const body = await response.json() as { requests: Array<{ path: string }> };
  return body.requests.map((request) => request.path);
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test("technician customer workspace is assignment-scoped and field-only", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await resetServerRequests(page);
  await addRoleCookie(page, "technician");
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Route customers" })).toBeVisible();
  await expect(page.getByText("Assigned-customer view")).toBeVisible();
  await expect(page.getByRole("button", { name: /New Customer/i })).toHaveCount(0);
  await expect(page.getByText("Taylor Morgan")).toBeVisible();

  await page.goto("/customers/customer-1");
  await expect(page.getByRole("heading", { name: "Taylor Morgan" })).toBeVisible();
  await expect(page.getByText("Assigned customer record")).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit customer/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Service Plans/i })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Equipment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByText("Whirlpool WTW5057LW")).toBeVisible();
  await expect(page.getByText(/\$\d/)).toHaveCount(0);

  const requests = await serverRequestPaths(page);
  expect(requests).toContain("/api/customers/customer-1");
  expect(requests).toContain("/api/equipment");
  expect(requests.some((requestPath) => requestPath.startsWith("/api/service-plans"))).toBe(false);

  await page.screenshot({
    path: path.join(artifactDir, "technician-customer-detail-desktop.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: path.join(artifactDir, "technician-customer-detail-mobile.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});

test("owner customer workspace retains office management controls", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await resetServerRequests(page);
  await addRoleCookie(page, "owner");
  await page.setViewportSize({ width: 1440, height: 1100 });

  await page.goto("/customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await expect(page.getByRole("button", { name: /New Customer/i })).toBeVisible();

  await page.goto("/customers/customer-1");
  await expect(page.getByRole("heading", { name: "Taylor Morgan" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit customer/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Service Plans" })).toBeVisible();
  await expect(page.getByText("Home Appliance Care")).toBeVisible();
  await expect(page.getByText("$189.00")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Equipment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete" })).toBeVisible();

  const requests = await serverRequestPaths(page);
  expect(requests).toContain("/api/service-plans");
  expect(requests).toContain("/api/service-plans/enrollments");
  expect(requests).toContain("/api/service-plans/visits");

  await page.screenshot({
    path: path.join(artifactDir, "owner-customer-detail-desktop.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});
