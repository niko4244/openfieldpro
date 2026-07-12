import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page, type Route } from "@playwright/test";

const artifactDir = path.resolve("artifacts");

const searchPayload = {
  jobs: [
    {
      id: "job-scheduled",
      title: "Washer not draining",
      status: "scheduled",
    },
  ],
  customers: [
    {
      id: "customer-1",
      name: "Taylor Morgan",
    },
  ],
  invoices: [
    {
      id: "invoice-1",
      number: "INV-1042",
      status: "draft",
    },
  ],
};

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

async function mockOverBroadSearch(page: Page) {
  await page.route(/\/api\/search(?:\?.*)?$/, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(searchPayload),
    });
  });
}

async function openSearch(page: Page) {
  await page.keyboard.press("Control+K");
  const input = page.getByRole("searchbox");
  await expect(input).toBeVisible();
  await input.fill("washer");
  await expect(page.getByText("Washer not draining")).toBeVisible();
}

test.beforeAll(async () => {
  await mkdir(artifactDir, { recursive: true });
});

test("technician command palette discards invoice rows from an over-broad response", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await addRoleCookie(page, "technician");
  await mockOverBroadSearch(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/jobs");

  await openSearch(page);

  await expect(page.getByPlaceholder("Search assigned jobs and customers...")).toBeVisible();
  await expect(page.getByText("Taylor Morgan")).toBeVisible();
  await expect(page.getByText("INV-1042")).toHaveCount(0);
  await expect(page.getByText("Invoices", { exact: true })).toHaveCount(0);

  await page.screenshot({
    path: path.join(artifactDir, "technician-command-palette-desktop.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});

test("owner command palette retains invoice search", async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page);
  await addRoleCookie(page, "owner");
  await mockOverBroadSearch(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/jobs");

  await openSearch(page);

  await expect(page.getByPlaceholder("Search jobs, customers, invoices...")).toBeVisible();
  await expect(page.getByText("INV-1042")).toBeVisible();
  await expect(page.getByText("Invoices", { exact: true })).toBeVisible();

  await page.screenshot({
    path: path.join(artifactDir, "owner-command-palette-desktop.png"),
    fullPage: true,
  });
  expect(runtimeErrors).toEqual([]);
});
